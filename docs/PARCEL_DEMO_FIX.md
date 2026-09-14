# 2026-09-14 线上故障修复

后台登录 404 的原因是 AuthContext 单独调用 `/api/auth/*`，绕过了子路径配置。现在登录、会话查询、退出统一使用 `api.auth`。新增测试直接调用 AuthProvider 提供的函数，验证根路径与 `/runner-demo/` 两种部署下的实际 fetch 地址；配送项目共 23 项测试通过，前端类型检查和生产构建通过。

小程序方面，已复现带 `Origin: https://servicewechat.com` 的请求被原 CORS 拦为 500。仅为 `/api/delivery-demo/` 放行这一精确来源，仍要求用户 JWT，不开启 Cookie 凭据。上线后未登录请求正确返回 401，预检返回 204。

针对用户反馈“地址已填却提示填写完整地址”，提交改为微信原生 `form` / `bindsubmit`，所有输入框设置 `name`，从 `event.detail.value` 读取当前可见值，减少对输入事件同步的依赖；输入更新整个 form，切回页面保留同一用户未提交内容。校验和网络错误显示在按钮旁并弹提示。重试仍使用原请求号及原内容。测试覆盖输入事件、前后台切换、页面数据落后于原生表单、失败重试；不能把这些测试当成手机实测。界面自动化被 Escape 中止，手机仍需重新编译、预览后确认，尚未观察到手机运行时的确切事件顺序。

已连接 `tx173`（VM-0-4-ubuntu）。本轮主备份为 `/home/ubuntu/parcel-demo-fix-20260914-120600/backup-complete`，后续表单修改备份为同级 `backup-form`。网页更新 `/home/ubuntu/runner-parcel-demo/dist/client` 的入口及哈希资源，旧资源保留。小程序在 `/home/ubuntu/miniprogram` 窄同步 `background/app.js`（针对线上文件打补丁）、`background/tests/parcelDemoMiniProgram.test.js`、`background/tests/parcelDemoCors.test.js`、`template/subpackages/delivery/create/create.js`、`template/subpackages/delivery/create/create.wxml` 和修复文档。没有覆盖密钥或数据库。已重启 PM2 `background`、`runner-parcel-demo`；后续纯小程序源文件修改无需再次重启。

线上校验使用真实数据库查询校区、真实配送服务以及隔离测试路由内的虚构用户，测试单 3 完成建单、幂等重试、后台派单、骑手接单/取货/送达，测试单 4 已取消；没有伪造真实用户的 JWT。HTTPS 登录接口及发布 JS 路径检查通过，但之前联调只手工使用正确接口路径，遗漏了真实 AuthContext 路径错误，本次已增加回归覆盖。

小程序相关测试、JS 语法、wcc/wcsc 及远端 admin-ui 构建通过；admin-ui 验证输出写入本轮部署目录，不覆盖其线上页面。配送健康接口 `/runner-demo/api/health` 与主项目 `/api/healthz` 用于部署后检查。主项目没有 `/api/health` 接口，该地址的 404 不代表服务离线。

用户操作：刷新 https://yeegoods.cn/runner-demo/；微信开发者工具在 `E:\易谷创新\Gitclone\-` 重新编译、点击预览、手机扫新二维码。服务器重启不会更新手机已加载的小程序代码，旧二维码中的包不会自动变成新源码。

## 宽松测试版 0914.3

用户随后提供的截图显示地址、姓名、电话输入了单个 `1`。地址原先至少 2 字、电话要求 11 位，因而触发了校验；不能再将这次错误归因于输入未同步。按用户“先不要校验内容”的要求，演示页面移除内容必填和长度/手机号格式拦截，两个服务接口同步接受短文本。空文本由配送服务填入明确的演示占位内容，未选择或已失效校区记为 0 / “演示校区（未选择）”，数量留空默认 1。身份、请求结构、长度上限和重复请求控制仍保留，仅修改专用代取 Demo，通用配送订单接口规则未变。

模拟器入口故障已通过实际界面定位：旧运行实例只报告 3 个分包，并报 `onTapParcelDemo` 方法不存在，但源码有 4 个分包及该方法。12:22 完整点击编译后，日志报告 4 个分包，实际点击成功进入代取页面。未修改基础库版本或开启 CLI 服务端口。输入测试时界面操作被 Escape 中止；后续手机测试需用户扫描新预览二维码，页面头部应显示 `DEMO 0914.3`。

本版已部署 tx173：小程序目录 `/home/ubuntu/miniprogram` 更新 `background/routes/parcel_demo.js`、两个相关测试文件、`template/subpackages/delivery/create/create.{js,wxml}` 及本文；配送目录 `/home/ubuntu/runner-parcel-demo` 更新编译后的 `dist/server/routes/parcelDemo.js`。原文件备份 `/home/ubuntu/parcel-demo-relaxed-20260914-122800/backup`。已重启 `runner-parcel-demo` 和 `background`。

验证：配送 24 项测试、小程序 15 项测试、TS 编译、JS 语法及 WXML/WXSS 编译通过。admin-ui 未修改，沿用本轮前面已通过的构建结果。远端通过真实校区数据库和隔离测试用户联调，单字符地址/电话测试单 5 已完成派单→接单→取货→送达，空白表单测试单 6 成功建单后取消；重试去重和用户状态查询通过。上述联调仍使用隔离路由，不等于真实手机操作验收。
