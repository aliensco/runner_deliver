# 快递代取 Demo

已与易在校园小程序新增的“快递代取”演示模块对接。

2026-09-14 收口：版本 **0914.3**，用户反馈“可以了”。本阶段交付为小程序建单 → 网页后台查看与派单 → 骑手接单、取件、送达 → 小程序查询状态的免支付 Demo。后续开发以此版本为基线。

当前按用户要求采用宽松测试模式：地址、姓名、电话可填 `1` 或留空；留空由服务端填入明确标注的演示内容。未选校区使用演示校区，包裹数量留空默认 1。登录权限、重复请求控制和数据结构保护保留。线上使用自建配送平台，快跑者正式平台兼容留待后续。

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

配送平台 24 项测试、小程序 15 项测试通过；类型检查、服务端编译和网页构建通过，并使用本机微信开发者工具自带 wcc/wcsc 检查相关 WXML/WXSS。远端现有 admin-ui 构建通过。文档收口不重复运行已经通过且代码未变的测试。

线上 HTTPS 网页、登录、派单、骑手状态更新和用户订单查询闭环已通过独立测试路由联调；取消和幂等重试通过。测试不冒用真实小程序用户。用户在宽松模式交付后确认可用，这不扩大为支付、真实运营等未实现能力的验收。

最近功能备份：`/home/ubuntu/parcel-demo-relaxed-20260914-122800/backup`。本次仅同步交付文档，备份为 `/home/ubuntu/parcel-demo-closeout-20260914/backup`，无需重启服务。修复经过与具体同步清单见 [PARCEL_DEMO_FIX.md](PARCEL_DEMO_FIX.md)。

本版为免支付功能 Demo，尚无微信支付退款、真实地图与距离、消息推送、自动派单或配送异常处理。输入测试包裹，不要据此组织真实配送。订单数据在远端 SQLite 持久化；这与本机 `127.0.0.1:5173` 的数据是两个独立实例。
