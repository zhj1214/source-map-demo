import axios from "axios";
let service = axios.create({
  // baseURL: "/api",
  baseURL: "/errors/sourcemap",
}); // 请求拦截

service.interceptors.request.use(
  (config) => {
    return config;
  },
  (err) => {
    return Promise.reject(err);
  }
);
// 响应拦截
service.interceptors.response.use(
  async (response) => {
    let { data, config } = response;
    return data;
  },
  (err) => {
    return Promise.reject(err);
  }
);

export const http = service;
