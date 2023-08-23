/*
 * @Description: 大文件切片上传
 * @Version: 0.0.1
 * @Autor: zhj1214
 * @Date: 2023-01-03 16:51:11
 * @LastEditors: zhj1214
 * @LastEditTime: 2023-08-23 10:10:58
 */
import sparkMD5 from "spark-md5";
import { http } from "@/utils/request";

// 切片大小
const CHUNK_SIZE = 8 * 1024 * 1024;
// 重试次数
const ErrorRetryCount = 1;

/**
 * @description: 计算文件切片始末位置
 * @param {*} size 默认切片大小
 */
export const createFileChunk = (file, size = CHUNK_SIZE) => {
  const chunks = [];
  let cur = 0;
  const maxLen = Math.ceil(file.size / size);
  while (cur < maxLen) {
    const start = cur * size;
    const end = start + size >= file.size ? file.size : start + size;
    chunks.push({ index: cur, file: file.slice(start, end) });
    cur++;
  }
  return chunks;
};

/**
 * @description: 根据计算的切片长度进行切片，并返回文件映射的hash值
 * @param {*} chunks 计算的切片信息
 */
export const calculateHash = (chunks, hashProgressInfo) => {
  let count = 0;
  const len = chunks.length;
  // hash进度
  let hashProgress = 0;
  // 文件hash
  let hash;
  // hash数组
  const spark = new sparkMD5.ArrayBuffer();
  // 开始截取时间
  const startTime = new Date().getTime();

  return new Promise((resolve) => {
    const loadNext = (index) => {
      // 创建读取文件对象
      const reader = new FileReader();
      //   读取文件
      reader.readAsArrayBuffer(chunks[index].file);
      //   读取完成
      reader.onload = function (e) {
        // 读取完成时间
        const endTime = new Date().getTime();
        // 覆盖原来的切片信息
        chunks[count] = { ...chunks[count], time: endTime - startTime };
        count++;
        // 添加文件内容
        spark.append(e.target.result);
        // 是否继续读取
        if (count == len) {
          hashProgressInfo(100);
          hash = spark.end();
          resolve(hash);
        } else {
          hashProgress += 100 / len;
          hashProgressInfo(hashProgress);
          loadNext(index + 1);
        }
      };
    };
    loadNext(0);
  });
};

/**
 * @description: 拼接需要上传的切片信息
 * @param {*} chunks 完整的原始切片数组
 * @param {*} hash 文件hash
 * @param {*} uploadedList 已存在的切片数组,断点续传才存在
 * @param {*} ext 文件扩展名
 * @return {*} 返回需要上传的切片信息
 */
export const splicingUploadParams = (
  chunksTemp,
  hash,
  uploadedList = [],
  ext
) => {
  // 1. 组装上传数据
  const chunks = chunksTemp.map((chunk, index) => {
    const name = hash + "-" + index;
    // 是否已上传过这个片段
    const isChunkUploaded = uploadedList.includes(name) ? true : false;
    return {
      hash,
      name,
      index,
      chunk: chunk.file,
      progress: isChunkUploaded ? 100 : 0,
    };
  });

  // 2. 过滤掉已上传的切片，只上传没有的切片
  let requests = chunks
    .filter((e) => !uploadedList.includes(e.name))
    .map((chunk) => {
      let name = chunk.name;
      //  如果有切片的话，那么不能有扩展名称
      if (chunks.length === 1) {
        name += ext;
      }
      let form = new FormData();
      form.append("name", name);
      // 重点来了，这里一定要有三个参数，第三个参数是 文件名称（包括扩展名）name
      form.append("file", chunk.chunk, name);
      form.append("hash", chunk.hash);
       // 如果是切片，那么切片目录名字应该是hash 的前 6 个字符； 如果服务端设置了目录则失效
       form.append(
        "category",
        chunks.length === 1 ? "" : chunk.hash.slice(0, 6)
      );
      //  文件扩展名
      form.append("ext", ext);
      //  如果是切片上传，则增加标识
      form.append("isSliceUpload", chunks.length > 1);
      return { form, index: chunk.index, error: 0 };
    });

  return { requests, chunks };
};

/**
 * @description: 开始上传切片
 * @param {*} url 上传地址
 * @param {*} chunks 原始chunks
 * @param {*} requests 要上传的切片数组
 * @param {*} limit 默认并发数量（切片数量大于 1 才会生效）
 */
export const startUpload = (url, chunks, requests, limit = 1) => {
  const len = requests.length;
  // 用于上传计数，判断所有切片是否都上传成功
  let count = 0;
  //   是不是中断了上传
  let isStop = false;

  return new Promise((resolve, reject) => {
    const upLoadReq = () => {
      if (isStop) return;
      const req = requests.shift();
      if (!req) return;
      const { form, index } = req;
      const fail = () => {
        chunks[index].progress = -1;
        if (req.error < ErrorRetryCount) {
          req.error++;
          requests.unshift(req);
          upLoadReq();
        } else {
          isStop = true;
          reject();
        }
      };

      const success = (res) => {
        //最后一片
        if (count == len - 1) {
          resolve(res);
        } else {
          count++;
          upLoadReq();
        }
      };

      http
        .post(url, form, {
          onUploadProgress: (progress) => {
            chunks[index].progress = Number(
              ((progress.loaded / progress.total) * 100).toFixed(2)
            );
          },
        })
        .then((res) => {
          if (res.code === 10000) {
            success(res);
          } else {
            fail(); // 会重试请求
          }
        })
        .catch(() => {
          fail();
        });
    };

    while (limit > 0) {
      setTimeout(() => {
        upLoadReq();
      }, Math.random() * 2000);
      limit--;
    }
  });
};
