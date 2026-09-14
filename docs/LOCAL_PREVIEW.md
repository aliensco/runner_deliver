# 本地预览与调试

本仓库是 RunnerGo 本地配送 Web MVP，与快跑者线上系统的数据、账号及服务相互独立。现有骑手端是响应式网页，没有 APK、iOS 安装包或小程序。

## 启动

依赖已在本机安装。在 PowerShell 中运行：

```powershell
cd E:\Runner_delivery
.\start-dev.ps1
```

脚本会启动 API 和 Vite 开发服务器；修改前端后页面自动更新，修改后端后服务自动重启。按 Ctrl+C 停止。脚本不依赖全局 npm；它优先使用 PATH 中的 Node，也支持本机 Codex 附带的 Node。

重新安装环境时，推荐安装带 npm 的 Node.js 22.12+，然后执行 `npm ci`。完整 Node/npm 环境也可以直接使用仓库原有的 `npm run dev`。

- 页面：http://127.0.0.1:5173
- API 健康检查：http://127.0.0.1:3000/api/health
- 首次启动会生成演示数据库：`data/runner-deliver.db`。

## 查看三端

登录页点击角色卡片可自动填入本地演示账号，再点击登录。

| 角色 | 账号 | 默认本地密码 |
| --- | --- | --- |
| 管理员 | demo_admin | DemoOnly123! |
| 商户 | demo_merchant | DemoOnly123! |
| 骑手 | demo_rider | DemoOnly123! |

在 Chrome 或 Edge 打开页面，按 F12，再按 Ctrl+Shift+M，选择手机设备或设置约 390 × 844 的视口。登录骑手账号即可查看手机布局、我的任务、收入和工作状态。这是浏览器设备模拟，不验证真机 GPS、推送或原生 App 行为。

同一浏览器配置中的普通标签页共享登录 Cookie。联调多个角色时，用 Chrome 普通窗口、Chrome 无痕窗口和 Edge 分别登录三个角色；仅开三个普通标签页不能隔离会话。

## 手动体验配送闭环

1. 商户登录，发起一笔配送订单，观察余额与费用。
2. 管理员登录，在调度页把该订单派给与 demo_rider 绑定的演示骑手，可先在骑手账号的工作状态页确认姓名。
3. 骑手刷新任务列表，打开订单，依次接单、取货、确认送达。
4. 骑手查看收入，商户查看订单状态，管理员查看订单事件与资金流水。

当前列表没有实时推送，跨角色操作后可能需要手动刷新。调度地图是示意图，配送距离来自订单填写值，不能用于实际导航。

## 调试

- 页面报错：F12 → Console，查看红色错误及堆栈。
- 请求异常：F12 → Network → Fetch/XHR，查看 `/api` 请求的状态码、请求体与响应。401 通常代表未登录或会话失效，403 是权限限制，409 通常是状态流转或业务冲突。
- 后端异常：查看启动终端里 `[api]` 前缀的输出。
- 页面修改入口：`src/client/pages/RiderPages.tsx`、`src/client/pages/OrderDetailPage.tsx`、`src/client/styles.css`。
- 订单业务入口：`src/server/orders.ts`；接口入口：`src/server/routes/orders.ts`。

需要后端断点时，先 Ctrl+C 停掉开发服务，再在两个终端分别运行：

```powershell
# 终端一：开启本机调试端口 9229
node --inspect=127.0.0.1:9229 --import tsx src/server/index.ts

# 终端二：启动前端
node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort
```

Chrome 打开 `chrome://inspect`，在 Node 目标下选择 inspect；也可在 VS Code 中使用“Debug: Attach to Node Process”。在订单接口或业务函数设置断点，再从网页触发请求。

本机缺少全局 npm 时，检查命令可以直接运行：

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.server.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.client.json --noEmit
node node_modules/vitest/vitest.mjs run
```

## 手机真机访问

手机上的 127.0.0.1 指向手机自己。当前服务只监听电脑本机，手机不能直接打开上述地址。首次查看效果建议先用浏览器设备模拟；需要真机联调时，再配置同一 Wi-Fi 下的开发代理访问与局域网监听，并为演示账号设置独立密码。

## 快跑者参考系统

- 管理后台：http://www.keloop.cn/admin
- 店铺登录：https://o2o.keloop.cn/insideadmin/login
- 用户提供的帮助文档地址：https://help.kingfeer.com/?id=471

这些入口用于了解原产品。线上账号不能用于本地登录，也不能从这些网址推导出骑手 App 安装地址。原厂骑手端的下载入口、团队绑定方式与账号开通流程需要在原厂后台或对应帮助文档中核实。
