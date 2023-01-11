const stack = (stack) => {
  const lines = stack.split("\n");
  // 报错信息
  const newLines = [lines[0]];
  // 逐行处理
  for (const item of lines) {
    if (/.*(https?:\/\/.+):(\d+):(\d+)$/) {
      const arr = item.match(/@(https:\/\/.+):(\d+):(\d+)$/) || [];
      if (arr.length === 4) {
        const url = arr[1];
        const line = Number(arr[2]);
        const column = Number(arr[3]);
        const filename = (url.match(/[^/]+$/) || [""])[0];
        // console.log("url: ", url);
        // console.log("line: ", line);
        // console.log("column: ", column);
        // console.log("filename: ", filename);
        // console.log("---------------: ");
        newLines.push({
          url,
          line,
          column,
          filename,
        });
      }
    }
  }
  return newLines.join("\n");
};

const results = stack(
  `<TypeError: this.initData is not a function. (In 'this.initData()', 'this.initData' is undefined)>\nonShow@https://usr//app-service.js:5744:2010\nonShow@[native code]\npo@https://usr//app-service.js:5057:27522\ngo@https://usr//app-service.js:5057:27601\n@https://usr//app-service.js:5057:32581\n@https://usr//app-service.js:5057:54694\n@https://lib/WASubContext.js:1:775540\n@[native code]\n@https://lib/WASubContext.js:1:775333\n@https://lib/WASubContext.js:1:785609\n@https://lib/WASubContext.js:1:745394\n@https://lib/WASubContext.js:1:788116\n@https://lib/WASubContext.js:1:745394\n@https://lib/WASubContext.js:1:791446\n@https://lib/WASubContext.js:1:745394\nxr@https://lib/WASubContext.js:1:792142\n@https://lib/WASubContext.js:1:744498\n@https://lib/WAServiceMainContext.js:1:847062\nemit@https://lib/WAServiceMainContext.js:1:843813\nemit@[native code]\n@https://lib/WAServiceMainContext.js:1:2585312\n@https://lib/WAServiceMainContext.js:1:853487\n@https://lib/WAServiceMainContext.js:1:847161\nemit@https://lib/WAServiceMainContext.js:1:843813\n@https://lib/WAServiceMainContext.js:1:907321\n@https://lib/WAServiceMainContext.js:1:884248\nemit@https://lib/WAServiceMainContext.js:1:94817\nemit@[native code]\nemit@https://lib/WAServiceMainContext.js:1:94436\nsubscribeHandler@https://lib/WAServiceMainContext.js:1:97085\nglobal code@`
);

console.log("解析结果：", results);
