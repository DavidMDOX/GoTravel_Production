
# GoTravel Drop-in 修复包

这是一个可直接替换部署的最小可用版本：
- 提供 `/public/index.html` 向导页面，按钮均可点击且有错误处理。
- 提供 `/api/health` 与 `/api/generate` 两个后端接口，避免“解析失败请重试”。
- 包含 `manifest.json`、`sw.js` 以及图标，支持 PWA。
- 含 `vercel.json` 路由规则，可直接 `vercel deploy`。

## 使用方法
1. 备份你的仓库。
2. 将本压缩包中的 `public/`、`api/`、`vercel.json` 覆盖到你的仓库根目录（与原仓库同名目录一致）。
3. 本地测试：使用任意静态服务器（如 `npx serve public`）无法调用 API；推荐在 Vercel 上部署以启用 `/api/*`。
4. 部署到 Vercel 后访问首页测试按钮：
   - “安装依赖” 会调用 `/api/health`
   - “开始生成/重新解析” 会调用 `/api/generate`

如需把逻辑接入真实后端，只需在 `/api/generate.js` 中替换为真实解析逻辑。
