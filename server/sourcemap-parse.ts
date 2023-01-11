/*
 * @Description: 服务端错误解析定位
 * @Version: 0.0.1
 * @Autor: zhj1214
 * @Date: 2023-01-11 14:12:44
 * @LastEditors: zhj1214
 * @LastEditTime: 2023-01-11 14:45:44
 */

import * as Path from "path";
import * as Fs from "fs-extra";
import {
  SourceMapConsumer,
  BasicSourceMapConsumer,
  IndexedSourceMapConsumer,
} from "source-map";

// 上传的文件保存路径
const uploadDir = Path.join(process.cwd(), "public");
// 缓存SourceMapConsumer实例
type Cache = {
  [key: string]: BasicSourceMapConsumer | IndexedSourceMapConsumer | undefined;
};
interface ParseStackItem {
  url: string;
  line: number;
  column: number;
  filename: string;
}

export default class ParseSourceMap {
  /** 缓存consumer */
  private cache: Cache = {};

  /**
   * @description: 读取sourcemap文件内容
   * @return {*} 文件内容
   */
  private async rawSourceMap(filepath: string) {
    filepath = Path.join(uploadDir, filepath);
    if (await Fs.pathExists(filepath)) {
      return Fs.readJSON(filepath, { throws: false });
    }
    return null;
  }

  /**
   * @description: 根据行和列，从sourcemap中定位源码的位置
   * @param {string} filename 文件名称
   * @param {number} line
   * @param {number} column
   * @return {*} 源码文档对象
   */
  private async parse(filename: string, line: number, column: number) {
    let consumer;
    if (this.cache[filename]) {
      consumer = this.cache[filename];
    } else {
      const raw = await this.rawSourceMap(filename);
      if (raw) {
        consumer = await SourceMapConsumer.with(
          raw,
          null,
          (consumer) => consumer
        );
        this.cache[filename] = consumer;
      }
    }
    return consumer ? consumer.originalPositionFor({ line, column }) : null;
  }

  private parseStack(stack: string): ParseStackItem[] {
    const lines = stack.split("\n");
    const linesArr: ParseStackItem[] = [];
    // 1. 逐行处理
    for (const item of lines) {
      if (/.*(https?:\/\/.+):(\d+):(\d+)$/) {
        const arr = item.match(/@(https:\/\/.+):(\d+):(\d+)$/) || [];
        if (arr.length === 4) {
          linesArr.push({
            url: arr[1],
            line: Number(arr[2]),
            column: Number(arr[3]),
            filename: (arr[1].match(/[^/]+$/) || [""])[0],
          });
        }
      }
    }
    return linesArr;
  }

  /**
   * @description: 解析、定位、还原错误详情
   * @param {string} stack 报错信息
   * @return {*} 解析后的错误详情
   */
  public async stack(stack: string, linesArr: ParseStackItem[]) {
    const lines = stack.split("\n");
    const newLines: string[] = [lines[0]];
    // 1. 逐行处理
    if (!linesArr) {
      linesArr = this.parseStack(stack);
    }

    for (const item of linesArr) {
      const line = item.line;
      const column = item.column;
      const filename = item.filename;
      // 2. 根据行和列，从sourcemap中定位源码的位置
      const res = await this.parse(filename + ".map", line, column);
      // 3. 根据源文件名寻找对应源文件索引
      const consumer:
        | BasicSourceMapConsumer
        | IndexedSourceMapConsumer
        | undefined = this.cache[filename];
      if (consumer) {
        const sourceIndex = consumer.sources.findIndex(
          (item) => item === res.source
        );
        // 3.1 根据原文件索引找到对应源文件内容
        const sourceFile = (consumer as BasicSourceMapConsumer).sourcesContent[
          sourceIndex
        ];
        const contentRowArr = sourceFile.split("\n"); //切分
        // 3.2 读取部分代码片段
        res.sourcesContent = "";
        contentRowArr.forEach((line, index) => {
          if (index < res.line + 10 && index > res.line - 10)
            res.sourcesContent += `${line}\n`;
        });
      }
      // 4. 拼装结果
      if (res && res.source) {
        const content = `    at ${res.name} (${[
          res.source,
          res.line,
          res.column,
          res.sourcesContent,
        ].join(":")})`;
        newLines.push(content);
      } else {
        newLines.push(item);
      }
    }
    return newLines.join("\n");
  }

  /**
   * @description: 清楚缓存的实例
   */
  public destroy() {
    Object.keys(this.cache).forEach((key: keyof Cache) => {
      const item = this.cache[key];
      item && item.destroy();
      this.cache[key] = undefined;
    });
  }
}
