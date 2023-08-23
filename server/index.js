const Koa = require("koa");
const Router = require("koa-router");
const koaBody = require("koa-body");
const path = require("path");
const fse = require("fs-extra");
const fs = require("fs");
var cors = require("kcors");
var sourceMap = require("source-map");
var adm_zip = require("adm-zip");

const app = new Koa();
app.use(cors());
const router = new Router();
const UPLOAD_DIR = path.resolve(__dirname, "public");

app.use(
  koaBody({
    multipart: true, // 支持文件上传
  })
);

router.post("/checkfile", async (ctx) => {
  const body = ctx.request.body;
  // console.log(body);
  const { ext, hash } = body;
  const filePath = path.resolve(UPLOAD_DIR, `${hash}.${ext}`);
  let uploaded = false;
  let uploadedList = [];

  if (fse.existsSync(filePath)) {
    uploaded = true;
  } else {
    uploadedList = await getUploadedList(path.resolve(UPLOAD_DIR, hash));
  }
  ctx.body = {
    code: 0,
    data: {
      uploaded, // 是否存在该文件
      filePath,
      uploadedList, // 已上传的切片数组
    },
  };
});

/**
 * @description: 获取目录下已上传的切片数组
 * @param {*} dirPath
 */
async function getUploadedList(dirPath) {
  return fse.existsSync(dirPath)
    ? (await fse.readdir(dirPath)).filter((name) => name[0] !== ".")
    : [];
}

router.post("/uploadstreamfile", async (ctx) => {
  const body = ctx.request.body;
  const file = ctx.request.files.chunk;
  console.log(ctx.request.files,'上传接收到的：body：',body);

  const { hash, name, totalBlock } = body;

  const chunkPath = path.resolve(UPLOAD_DIR, hash);
  if (!fse.existsSync(chunkPath)) {
    await fse.mkdir(chunkPath);
  }

  // uploadedList = await getUploadedList(chunkPath);

  // if (uploadedList.length == totalBlock) {
  //   return (ctx.body = {
  //     code: -1,
  //     message: `所有切片已上传`,
  //   });
  // }

  await fse.move(file.filepath, `${chunkPath}/${name}`);

  ctx.body = {
    code: 0,
    data: {
      filePath: hash,
    },
    message: `切片上传成功`,
  };
});

/**
 * @description: 合并所有切片
 * @param {*} ext 文件扩展名
 * @param {*} size 设定的切片大小
 * @param {*} hash 文件的hash值
 */
router.post("/mergeFile", async (ctx) => {
  const body = ctx.request.body;
  const { ext, size, hash } = body;
  // 文件最终路径
  const filePath = path.resolve(UPLOAD_DIR, `${hash}.${ext}`);
  await mergeFile(filePath, size, hash);
  const fileNamePath = `/public/${hash}.${ext}`;
  // 解压缩文件
  if (fileNamePath.includes(".zip")) {
    const unzipFilepath = path.resolve(UPLOAD_DIR, `${hash}.${ext}`);
    const unzippath = path.resolve(UPLOAD_DIR, `${hash}`);
    var unzip = new adm_zip(unzipFilepath);
    unzip.extractAllTo(unzippath, true);
  }

  ctx.body = {
    code: 0,
    data: {
      url: fileNamePath,
    },
  };
});

/**
 * @description: 读取所有切片数据，并排序
 * @param {*} filePath 文件最终路径
 */
async function mergeFile(filePath, size, hash) {
  // 1. 读取所有切片
  const chunkDir = path.resolve(UPLOAD_DIR, hash);
  let chunks = await fse.readdir(chunkDir);
  // 2. 排序切片，得到切片地址数组
  chunks = chunks.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  chunks = chunks.map((cpath) => path.resolve(chunkDir, cpath));
  await mergeChunks(chunks, filePath, size);
}

function mergeChunks(files, dest, CHUNK_SIZE) {
  /**
   * @description:
   * @param {*} filePath 切片地址
   * @param {*} writeStream 切片写入目标信息实例
   */
  const pipeStream = (filePath, writeStream) => {
    return new Promise((resolve, reject) => {
      // 读取切片数据
      const readStream = fse.createReadStream(filePath);
      // 读取完成删除切片
      readStream.on("end", () => {
        fse.unlinkSync(filePath);
        resolve();
      });
      // 切片数据拼接到目标地址中，用于合并生成新的文件
      readStream.pipe(writeStream);
    });
  };

  const pipes = files.map((file, index) => {
    return pipeStream(
      file,
      fse.createWriteStream(dest, {
        start: index * CHUNK_SIZE,
        end: (index + 1) * CHUNK_SIZE,
      })
    );
  });
  return Promise.all(pipes);
}

/**
 * @description: 解析sourcemap文件
 * @param {*} name 文件名称
 * @param {*} row 哪一行
 * @param {*} col 那一列
 */
router.post("/sourcemap", async (ctx) => {
  const body = ctx.request.body;
  const { name, row, col, hash } = body;

  // 1. 找到上传文件对应的path目录
  const SourcemapPtah = path.resolve(UPLOAD_DIR, `${hash}`);
  // 2. 报错文件指定的sourcemap文件地址
  const sourceMapPathDestination = `${SourcemapPtah}${name}`;
  // 3. 调用sourcemap模块
  if (sourceMapPathDestination.includes(".map")) {
    const res = await lookupSourceMap(sourceMapPathDestination, row, col);
    if (res.code === 301) {
      ctx.body = {
        code: 404,
        data: {},
        massage: "sourceMap读取失败",
      };
    }
    // console.log("最后的结果", res);
    ctx.body = {
      code: 200,
      data: {
        codeContent: res.sourcesContent || "",
        source: res.source || "",
        line: res.line || "0",
        column: res.column || "0",
      },
    };
  } else {
    ctx.body = {
      code: 404,
      data: {},
      massage: "sourceMap文件路径不正确",
    };
  }
});

const readFile = function (filePath) {
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: "utf-8" }, function (error, data) {
      if (error) {
        console.log(error);
        return reject(error);
      }
      resolve(JSON.parse(data));
    });
  });
};

async function lookupSourceMap(mapFile, line, column) {
  console.log(
    "报错文件指定的sourcemap文件地址",
    mapFile,
    "--",
    line,
    "--",
    column
  );
  // 1. 读取文件
  const rawSourceMap = await readFile(mapFile);
  // const rawSourceMap = JSON.parse(fs.readFileSync(mapFile).toString()); // 打包后的sourceMap文件
  if (!rawSourceMap) {
    return { code: 301 };
  }
  // 2. 初始化consumer解析器
  const consumer = await new sourceMap.SourceMapConsumer(rawSourceMap);
  // 3. 解析内容
  const res = consumer.originalPositionFor({
    line: Number(line) || 0,
    column: Number(column) || 0,
  });
  // 4. 根据源文件名寻找对应源文件索引
  const sourceIndex = consumer.sources.findIndex((item) => item === res.source);
  // 5. 根据原文件索引找到对应源文件内容
  const sourceContentS = consumer.sourcesContent[sourceIndex];
  const contentRowArr = sourceContentS.split("\n"); //切分
  // 6. 读取部分代码片段
  res.sourcesContent = "";
  contentRowArr.forEach((line, index) => {
    if (index < res.line + 10 && index > res.line - 10)
      res.sourcesContent += `${line}\n`;
  });

  // 5. 销毁解析器
  consumer.destroy();
  return res;
}

app.use(router.routes());
app.listen(7001, () => {
  console.log("server running at 7001");
});
