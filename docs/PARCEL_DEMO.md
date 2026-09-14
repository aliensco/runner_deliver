# 快递代取 Demo

已与易在校园小程序新增的“快递代取”演示模块对接。

网页入口：https://yeegoods.cn/runner-demo/

管理员 demo_admin，骑手 demo_rider。独立随机密码保存在本机忽略目录 `data/parcel-deploy/demo-access.txt`，不要提交到仓库。线上配置不再自动填充本地默认密码。

手机：微信开发者工具打开 `E:\易谷创新\Gitclone\-` → 编译 → 预览 → 微信扫码 → 登录 → 首页快递代取。用户自行执行预览，本次未上传体验版或发布正式版。

后台管理员刷新待派单列表，把代取单分配给“演示骑手”；另一浏览器以骑手登录，依次接单、取货、送达。小程序订单详情每 5 秒查询状态，取货前允许用户取消。

本版所有代取单归专用“易在校园·代取演示”运营主体，使用零费用规则，不扣商户余额、不入账骑手收入。管理员若误改免费规则，服务会拒绝建单，不会悄悄收费。后端独立表保存来源用户、请求号、校区、件数和取件码，创建和来源关联在同一 SQLite 事务内完成。

## 运行与部署

本地仍使用 `start-dev.ps1` 启动。默认不配置 PARCEL_DEMO_KEY 时，外部接入接口关闭；网页原有演示功能保留。

服务器目录：`/home/ubuntu/runner-parcel-demo`，PM2 `runner-parcel-demo`，端口 3038 只监听回环地址。易在校园后端为 `/home/ubuntu/miniprogram`，PM2 `background`。两服务经本机 HTTP 和独立服务密钥通信，不依赖用户电脑或 SSH 隧道。

网页发布构建使用 RUNNER_BASE_PATH=/runner-demo/ 和 VITE_SHOW_DEMO_ACCOUNTS=false；会话使用 SESSION_COOKIE_SECURE=true、SESSION_COOKIE_PATH=/runner-demo/。服务间 API 为 `/api/integrations/parcel-demo/orders` 及查询/取消子路由，由 PARCEL_DEMO_KEY 保护，公网 Nginx 禁止访问这个接口族。

2026-09-14 部署备份：`/home/ubuntu/parcel-demo-deploy-20260914-112850/backup`。小程序源码修改已通过针对远端实际文件的窄补丁同步，未覆盖现有其他改动。新增配送进程，重启 background，检查并 reload Nginx，保存 PM2 进程清单。

## 验证与限制

配送平台 21 项 API 测试通过（原 14 项加 7 项集成测试）；前后端类型检查和网页构建通过。小程序有请求适配、提交重试和路由测试，并使用本机微信开发者工具自带 wcc/wcsc 检查新增页面及修改入口的 WXML/WXSS。远端现有 admin-ui 构建通过。

线上 HTTPS 网页、登录、派单、骑手状态更新和用户订单查询闭环已通过独立测试路由联调；取消和幂等重试通过。测试不冒用真实小程序用户。实际手机视觉和微信扫码登录仍由用户通过预览验收。

本版为免支付功能 Demo，尚无微信支付退款、真实地图与距离、消息推送、自动派单或配送异常处理。输入测试包裹，不要据此组织真实配送。订单数据在远端 SQLite 持久化；这与本机 `127.0.0.1:5173` 的数据是两个独立实例。
