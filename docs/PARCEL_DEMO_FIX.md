# 2026-09-14 线上故障修复

后台登录 404 的原因是 AuthContext 单独调用 `/api/auth/*`，绕过了子路径配置。现在登录、会话查询、退出统一使用 `api.auth`。新增测试直接调用 AuthProvider 提供的函数，验证根路径与 `/runner-demo/` 两种部署下的实际 fetch 地址；配送项目共 23 项测试通过，前端类型检查和生产构建通过。

小程序方面，已复现带 `Origin: https://servicewechat.com` 的请求被原 CORS 拦为 500。仅为 `/api/delivery-demo/` 放行这一精确来源，仍要求用户 JWT，不开启 Cookie 凭据。上线后未登录请求正确返回 401，预检返回 204。

针对用户反馈“地址已填却提示填写完整地址”，提交改为微信原生 `form` / `bindsubmit`，所有输入框设置 `name`，从 `event.detail.value` 读取当前可见值，减少对输入事件同步的依赖；输入更新整个 form，切回页面保留同一用户未提交内容。校验和网络错误显示在按钮旁并弹提示。重试仍使用原请求号及原内容。测试覆盖输入事件、前后台切换、页面数据落后于原生表单、失败重试；不能把这些测试当成手机实测。界面自动化被 Escape 中止，手机仍需重新编译、预览后确认，尚未观察到手机运行时的确切事件顺序。

已连接 `tx173`（VM-0-4-ubuntu）。本轮主备份为 `/home/ubuntu/parcel-demo-fix-20260914-120600/backup-complete`，后续表单修改备份为同级 `backup-form`。网页更新 `/home/ubuntu/runner-parcel-demo/dist/client` 的入口及哈希资源，旧资源保留。小程序在 `/home/ubuntu/miniprogram` 窄同步 `background/app.js`（针对线上文件打补丁）、`background/tests/parcelDemoMiniProgram.test.js`、`background/tests/parcelDemoCors.test.js`、`template/subpackages/delivery/create/create.js`、`template/subpackages/delivery/create/create.wxml` 和修复文档。没有覆盖密钥或数据库。已重启 PM2 `background`、`runner-parcel-demo`；后续纯小程序源文件修改无需再次重启。

线上校验使用真实数据库查询校区、真实配送服务以及隔离测试路由内的虚构用户，测试单 3 完成建单、幂等重试、后台派单、骑手接单/取货/送达，测试单 4 已取消；没有伪造真实用户的 JWT。HTTPS 登录接口及发布 JS 路径检查通过，但之前联调只手工使用正确接口路径，遗漏了真实 AuthContext 路径错误，本次已增加回归覆盖。

小程序相关测试、JS 语法、wcc/wcsc 及远端 admin-ui 构建通过；admin-ui 验证输出写入本轮部署目录，不覆盖其线上页面。配送健康接口 `/runner-demo/api/health` 与主项目 `/api/healthz` 用于部署后检查。主项目没有 `/api/health` 接口，该地址的 404 不代表服务离线。

用户操作：刷新 https://yeegoods.cn/runner-demo/；微信开发者工具在 `E:\易谷创新\Gitclone\-` 重新编译、点击预览、手机扫新二维码。服务器重启不会更新手机已加载的小程序代码，旧二维码中的包不会自动变成新源码。
