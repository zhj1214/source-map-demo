/*
 * @Description: 上传插件
 * @Version: 0.0.1
 * @Autor: zhj1214
 * @Date: 2023-01-10 14:14:20
 * @LastEditors: zhj1214
 * @LastEditTime: 2023-01-10 14:14:22
 */

// const webpack = require('webpack')
// const UploadSourceMapPlugin = require('./uploadSourceMapPlugin')

// module.exports = {
//   publicPath: '/',
//   configureWebpack(config) {
//     if (process.env.NODE_ENV === 'production') {
//       config.plugins.push(
//         new webpack.SourceMapDevToolPlugin({
//           filename: 'sourcemap/[file].map', // 修改生成 sourcemap 文件的路径（对应 dist/sourcemap）
//           append: false // 不在文件末尾添加 sourcemapUrl
//         }),
//         new UploadSourceMapPlugin()
//       )
//     }
//   }
// }

const Path = require('path')
const Fs = require('fs')
const Axios = require('axios')
const FormData = require('form-data')
const PLUGIN_NAME = 'UploadSourceMapPlugin'

class UploadSourceMapPlugin {
  // 读取目录下所有的 .js.map 文件
  async getAssets(distDir) {
    const files = await Fs.promises.readdir(distDir)
    return files.filter(el => /\.js\.map$/i.test(el)).map(el => Path.join(distDir, el))
  }

  // 上传文件到服务端
  async upload(filepath) {
    const stream = Fs.createReadStream(filepath)
    const formData = new FormData()
    formData.append('file', stream)
    return Axios.default({
      url: 'http://localhost:3001/upload',
      method: 'put',
      headers: formData.getHeaders(),
      timeout: 10000,
      data: formData
    }).then().catch((err) => {
      console.error(Path.basename(filepath), err.message)
    })
  }

  apply(compiler) {
    // 路径需要与 SourceMapDevToolPlugin 插件存放 sourcemap 文件的地址一致
    const sourcemapDir = Path.join(compiler.options.output.path, 'sourcemap')
    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async() => {
      console.log('Uploading sourcemap files...')
      const files = await this.getAssets(Path.join(sourcemapDir, 'js')) // 只上传 js 的 sourcemap 文件
      for (const file of files) {
        await this.upload(file)
      }
      // 注意：node < 14.14.0 可以使用 Fs.promises.rmdir 替代
      await Fs.promises.rm(sourcemapDir, { recursive: true })
    })
  }
}

module.exports = UploadSourceMapPlugin
