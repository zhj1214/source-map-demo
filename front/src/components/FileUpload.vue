<template>
  <div class="wrap">
    <!-- 文件上传 -->
    <div>
      <el-upload
        ref="file"
        :http-request="handleFileUpload"
        action="#"
        class="avatar-uploader"
        :show-file-list="false"
      >
        <el-button type="primary">上传文件</el-button>
      </el-upload>
      <!-- 计算hash的进度： -->
      <div class="flex-center pmbox">
        <div style="min-width: 145px; text-align: right">计算hash的进度：</div>
        <el-progress
          style="width: 90%"
          :stroke-width="20"
          :text-inside="true"
          :percentage="hashProgress"
        ></el-progress>
      </div>
      <!-- 上传进度： -->
      <div class="flex-center pmbox">
        <div style="min-width: 145px; text-align: right">上传进度：</div>
        <el-progress
          style="width: 90%"
          :stroke-width="20"
          :text-inside="true"
          :percentage="uploaedProgress"
        ></el-progress>
      </div>

      <!-- 切片情况以及上传进度： -->
      <div class="flex-center pmbox" v-if="chunks.length > 0">
        <h3>切片情况以及上传进度：</h3>
        <div class="container" :style="{ width: cubeWidth + 'px' }">
          <div class="cube" v-for="chunk in chunks" :key="chunk.name">
            <div
              :class="{
                uploading: chunk.progress > 0 && chunk.progress < 100,
                success: chunk.progress == 100,
                error: chunk.progress < 0,
              }"
              :style="{ height: chunk.progress + '%' }"
            >
              <i
                class="el-icon-loading"
                :style="{ color: '#f56c6c' }"
                v-if="chunk.progress < 100 && chunk.progress > 0"
              ></i>
            </div>
          </div>
        </div>
      </div>
      <!-- 上传成功 -->
      <div class="flex-center pmbox" v-if="filePath">
        <div style="min-width: 145px; text-align: right">服务器目录：</div>
        <div style="width: 90%">{{ filePath }}</div>
      </div>
    </div>
    <!-- 解析sourcemap -->
    <div>
      <div style="font-size: 32px; color: red">
        请上传多个sourcemap文件的压缩文件包
      </div>
      <div class="flex-center pmbox">
        <div style="width: 230px; text-align: right">
          报错信息所指文件的相对路径：
        </div>
        <input type="text" style="width: 60%" v-model="filename" />
      </div>
      <div class="flex-center pmbox">
        <div style="width: 230px; text-align: right">row行号：</div>
        <input type="text" style="width: 60%" v-model="row" />
      </div>
      <div class="flex-center pmbox" style="margin-bottom: 20px">
        <div style="width: 230px; text-align: right">col列数：</div>
        <input type="text" style="width: 60%" v-model="col" />
      </div>
      <div class="btnjx" @click="getSourcemap">解析</div>
    </div>
    <!-- 代码展示 -->
    <div class="pmbox" v-if="code.source">
      <div class="flex-center">
        <div>源文件：{{ code.source }}</div>
        <div style="margin-left: 20px">行：{{ code.line }}</div>
        <div style="margin-left: 20px">列：{{ code.column }}</div>
      </div>
      <div style="overflow: auto">
        <pre
          class="language-javascript"
          style="
            position: relative;
            padding-left: 3.8em;
            counter-reset: linenumber;
          "
          :line="code.line"
          >{{ code.codeContent }}</pre
        >
      </div>
    </div>
  </div>
</template>

<script>
import {
  createFileChunk,
  calculateHash,
  splicingUploadParams,
  startUpload,
} from "./uploadMaxFile";
// 切片大小
const CHUNK_SIZE = 8 * 1024 * 1024;

export default {
  name: "file-upload",
  data() {
    return {
      file: null, // 要上传的文件
      chunks: [], // 切片数组
      hashProgress: 0, // hash 进度
      hash: "8de8fe77fa6883041297d3482e9eb519", // 整个文件对应的hash值
      filePath: "", // 后端返回的文件目录，与hash值一样
      filename: "/__APP__/app-service.js.map",
      fileHas: false,
      code: {}, // 代码解析对象
      row: 5739,
      col: 709,
    };
  },
  computed: {
    // 上传进度
    uploaedProgress() {
      // 1. 文件已上传,无需在上传
      if (this.fileHas) {
        return 100;
      }
      // 2. hash是否成功
      if (!this.file || !this.chunks.length) {
        return 0;
      }
      const loaded = this.chunks
        .map((e) => {
          const size = e.chunk.size;
          const chunk_loaded = (e.progress / 100) * size;
          return chunk_loaded;
        })
        .reduce((acc, cur) => acc + cur, 0);

      return parseInt(((loaded * 100) / this.file.size).toFixed(2));
    },
    // 切片元素宽度
    cubeWidth() {
      return Math.ceil(Math.sqrt(this.chunks.length)) * 20;
    },
  },

  methods: {
    /**
     * @description: 自定义处理要上传的文件
     * @param {*} e
     */
    async handleFileUpload(e) {
      console.log("① 要上传的文件：", e);
      const { file = null } = e;
      if (!file) {
        return;
      }
      this.fileHas = false;
      this.chunks = 0;
      this.hashProgress = 0;
      this.file = file;
      this.upload();
    },
    /**
     * @description: 开始切片上传
     */
    async upload() {
      // 根据文件大小计算切片长度
      const chunksTemp = createFileChunk(this.file);
      console.log("② 切片长度计算完成：", chunksTemp);
      // 根据切片长度进行切片 、 对整个文件进行hash
      const self = this;
      const hash = await calculateHash(chunksTemp, (progress) => {
        self.hashProgress = progress;
      });
      this.hash = hash;
      console.log("③ 要上传文件hash映射值：", hash);
      // 查询是否上传,或者是否继续断点上传
      this.$http
        .post("/checkfile", {
          hash,
          ext: this.file.name.split(".").pop(),
        })
        .then((res) => {
          if (!res || !res.data) {
            return;
          }
          const { uploaded, uploadedList } = res.data;
          if (uploaded) {
            console.log("④ 文件已存在，无需上传");
            this.filePath = res.data.filePath;
            this.fileHas = true;
            return this.$message.success("秒传成功");
          }
          // 组装上传数据
          const { chunks, requests } = splicingUploadParams(
            chunksTemp,
            this.hash,
            uploadedList
          );
          // 将拼接后的切片数据赋值给原始数据
          this.chunks = chunks;
          // 上传需要上传的切片信息
          this.uploadChunks(requests);
        });
    },
    /**
     * @description: 上传需要上传的切片信息
     * @param {*} requests
     */
    uploadChunks(requests) {
      console.log("需要上传的切片：", requests);
     
      // 并发，发送切片请求 3 代表一次并发3个请求上传
      
      startUpload("/uploadstreamfile", this.chunks, requests,3).then((res) => {
        console.log("所有切片上传完成✅", res);
        this.mergeFile();
      });
    },
    /**
     * @description: 发送合并请求
     */
    mergeFile() {
      this.$http
        .post("/mergeFile", {
          ext: this.file.name.split(".").pop(),
          size: CHUNK_SIZE,
          hash: this.hash,
        })
        .then((res) => {
          if (res && res.data) {
            this.filePath = res.data.url;
          }
        });
    },

    getSourcemap() {
      if (!this.filePath) {
        return this.$message.error("请先上传文件");
      }
      if (!this.filename || !this.filename.includes(".map")) {
        return this.$message.error("请输入正确的路径");
      }
      if (this.filename[0] != "/") {
        return this.$message.error("路径前面应该有'/'");
      }
      if (!this.row) {
        return this.$message.error("请输入行号");
      }
      if (!this.col) {
        return this.$message.error("请输入列号");
      }
      this.$http
        .post("/sourcemap", {
          hash: this.hash,
          row: this.row,
          col: this.col,
          name: this.filename,
        })
        .then((res) => {
          console.log("解析结果：", res);
          if (res.code === 200) {
            this.code = res.data;
          }
        });
    },
  },
};
</script>

<style scoped lang="scss">
.wrapBox {
  position: relative;
}
#block {
  width: 100px;
  height: 100px;
  background: red;
  position: absolute;
}
.container {
  display: flex;
  flex-wrap: wrap;
  margin: 20px auto;
  .cube {
    width: 18px;
    height: 18px;
    border: 1px solid #000;
    background-color: #eee;
    .success {
      background: green;
    }
    .uploading {
      background: blue;
    }
    .error {
      background: red;
    }
  }
}
.pmbox {
  width: 90%;
  padding-top: 20px;
  margin: 0 auto;
}
.flex-center {
  display: flex;
  align-items: center;
}
.btnjx {
  width: 200px;
  height: 44px;
  line-height: 44px;
  text-align: center;
  color: #fff;
  background-color: #409eff;
  border-radius: 6px;
  margin: 0 auto;
}
.language-javascript {
  background: #2d2d2d;
  color: #ccc;
  font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
  font-size: 1em;
  text-align: left;
  white-space: pre;
  word-spacing: normal;
  word-break: normal;
  word-wrap: normal;
  line-height: 1.5;
  -moz-tab-size: 4;
  -o-tab-size: 4;
  tab-size: 4;
  -webkit-hyphens: none;
  -ms-hyphens: none;
  hyphens: none;
}
</style>
