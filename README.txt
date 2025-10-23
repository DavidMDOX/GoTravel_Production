# 打包说明（v7）

1. 将整个目录部署到任意静态主机（Vercel/Netlify/Nginx）。
2. 设置环境变量：`OPENAI_API_KEY`（在平台的环境变量页面）。
3. 路由：
   - `/api/plan-stream` 指向 `plan-stream.js`（Edge 运行时）。
4. 首次发布后，请使用强制刷新（Ctrl+F5 / Cmd+Shift+R）以更新 Service Worker。
