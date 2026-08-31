# 快跑者配送系统调研与开源选型

> 调研日期：2026-08-30。本文用于本项目的产品范围与技术选型，不代表原厂文档，也不复制原厂源码、品牌素材或界面资产。

## 结论

- 快跑者不是单一订单后台，而是由团队调度后台、商户发单端和骑手端组成的配送业务闭环。
- 本次未找到快跑者/Keloop 官方开源仓库，也没有找到可在闭源委托项目里无改造直接替换的完整仓库。
- 成熟度最高的 Fleetbase 使用 AGPL-3.0/商业双许可；闭源白标或闭源 SaaS 直接派生会带来源码披露或商业授权问题。
- 国内 Apache-2.0 候选更适合参考领域模型，但公开仓库普遍缺少 README 宣称的部分端、使用较老技术栈，或不包含关键 SQL/后端。
- 因此本项目选择原创实现本地 MVP，第三方地图、支付、短信和智能调度通过适配层后续接入。

## 产品边界

公开帮助资料显示，配送主流程为：

```text
商户/管理员录单
  -> 商户侧计价与储备金扣款
  -> 人工派单、抢单或智能派单
  -> 骑手接单、到店、取货、配送、送达
  -> 商户应收/退款流水 + 骑手收入流水
  -> 订单、商户、骑手和财务统计
```

首版需要覆盖：

1. 管理员、商户、骑手登录与角色权限。
2. 商户、骑手、计价方案管理。
3. 管理员或商户创建配送单。
4. 人工派单及骑手配送状态流。
5. 撤单、异常、改派及完整订单事件记录。
6. 商户扣款/退款、骑手收入及人工调整流水。
7. 仪表盘和基础统计。

暂不接入真实支付、自动打款、短信、打印机、美团/饿了么授权、高德地图、原生 App、AI 智能派单和生产部署。

用户提供的帮助链接实际对应“同城系统导同城系统商品”，属于店铺商品迁移，不是配送系统帮助首页。若合同后续明确要求，可单独增加 `ImportJob` 与 Provider Adapter，首版只考虑 CSV/JSON；不得采集或记录第三方店铺明文密码。

## 公开资料

- [快跑者配送系统公开介绍](https://m.keloop.vip/delivery)
- [帮助中心：商户发单计价](https://help.kingfeer.com/?id=461)
- [帮助中心：骑手配送费计价](https://help.kingfeer.com/?id=462)
- [帮助中心：订单录入](https://help.kingfeer.com/?id=286)
- [帮助中心：订单管理](https://help.kingfeer.com/?id=248)
- [帮助中心：商户结算](https://help.kingfeer.com/?id=254)
- [帮助中心：骑手结算](https://help.kingfeer.com/?id=253)
- [用户给出的商品导入文章](https://help.kingfeer.com/?id=471nini)

部分文章发布较早，因此本文把它们用于确认业务流程和字段，不用于像素级复刻当前界面。

## GitHub 候选矩阵

| 项目 | 技术/用途 | 许可证 | 结论 |
| --- | --- | --- | --- |
| [Fleetbase](https://github.com/fleetbase/fleetbase)、[Fleet-Ops](https://github.com/fleetbase/fleetops)、[Navigator](https://github.com/fleetbase/navigator-app) | Laravel/Ember/React Native；订单、车队、实时派单、路线、POD | [AGPL-3.0 + 商业双许可](https://github.com/fleetbase/fleetbase/blob/main/LICENSE.md) | 最成熟，但闭源网络服务不宜直接 fork；需接受 AGPL 义务或购买商业许可 |
| [siam-server](https://github.com/siam1026/siam-server) | Spring Boot 2.3 + Vue/uni-app；商城与同城配送单体 | [Apache-2.0](https://github.com/siam1026/siam-server/blob/master/LICENSE) | 可参考领域模型；技术栈旧，默认分支缺部分骑手/商家端，不是完整成品 |
| [siam-cloud](https://github.com/siam1026/siam-cloud) | 老一代 Spring Cloud 微服务；商户、骑手、订单、商城 | [Apache-2.0](https://github.com/siam1026/siam-cloud/blob/master/LICENSE) | 对 MVP 过重，且公开前端不完整 |
| [kxmall](https://github.com/zhengkaixing/kxmall) | Spring Boot/Vue/uni-app 商城 | [Apache-2.0](https://github.com/zhengkaixing/kxmall/blob/v3.0.0-dev/LICENSE) | 可参考商城基础；默认分支缺配送员端和关键数据，不能当配送系统直接使用 |
| [Yummix](https://github.com/Soumitra-Sahoo/Yummix) | MERN；餐厅、骑手、订单状态与退款 | [MIT](https://github.com/Soumitra-Sahoo/Yummix/blob/main/LICENSE) | 可参考角色和状态机；项目年轻、社区验证很少，不宜整体照搬 |
| [Enatega](https://github.com/enatega/food-delivery-multivendor) | Next.js + React Native 多端前端 | [公开仓前端为 MIT](https://github.com/enatega/food-delivery-multivendor/blob/main/LICENSE) | 后端/API 为专有商业产品，不能算完整开源系统 |
| [AWS Delivery Routes Optimization](https://github.com/aws-samples/delivery-routes-optimization-for-logistics) | Java/React；批量车辆路径与时间窗优化 | [MIT-0](https://github.com/aws-samples/delivery-routes-optimization-for-logistics/blob/main/LICENSE) | 适合作为后续路线优化参考，不包含商户、骑手和结算业务 |
| [Timefold Solver](https://github.com/TimefoldAI/timefold-solver) / [jsprit](https://github.com/graphhopper/jsprit) | Java VRP/约束求解算法库 | Apache-2.0 | 后续智能派单可评估；不提供业务系统 |

明确不作为代码底座：

- [CoopCycle](https://github.com/coopcycle/coopcycle-web) 使用 Coopyleft，普通商业客户不满足其限定条件。
- [Wanyue Food-delivery-uniapp](https://github.com/WanyueKJ/Food-delivery-uniapp) 未提供许可证且缺后端；“公开可读”不等于获得商用授权。
- ShopXO 核心虽为 MIT，但配送员和调度能力属于另售插件，不能把插件视为 MIT 核心的一部分。

许可证结论只是工程筛查，不替代正式法律意见。进入生产前仍需逐项审计依赖、字体、图标、地图 SDK、图片素材及商标使用。
