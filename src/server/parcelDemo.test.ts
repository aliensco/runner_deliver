import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApplication, type Application } from "./app";
const key = "test-parcel-integration-key-32-characters";
const body = { sourceUserId: "42", requestId: "parcel_test_request_0001", campusId: 7, campusName: "测试大学 测试校区", pickupAddress: "测试驿站", pickupCode: "DEMO-123", parcelCount: 2, deliveryAddress: "测试宿舍 101", recipientName: "测试同学", recipientPhone: "18800000003", remark: "仅测试" };
describe("Parcel mini-program integration", () => {
  let application: Application;
  beforeEach(() => { application = createApplication({ databasePath: ":memory:", bcryptRounds: 4, seedDemoData: true, parcelDemoKey: key, demoPassword: "IntegrationTest123!" }); });
  afterEach(() => application.db.close());
  const auth = (r: request.Test) => r.set("Authorization", `Bearer ${key}`);
  const create = (overrides = {}) => auth(request(application.app).post("/api/integrations/parcel-demo/orders")).send({ ...body, ...overrides });
  async function login(role: string) {
    const agent = request.agent(application.app);
    expect((await agent.post("/api/auth/login").send({ username: `demo_${role}`, password: "IntegrationTest123!" })).status).toBe(200);
    return agent;
  }
  it("requires service authorization and rejects client-controlled fields", async () => {
    expect((await request(application.app).post("/api/integrations/parcel-demo/orders").send(body)).status).toBe(401);
    expect((await create({ feeCents: 1 })).status).toBe(400);
    expect((await create({ recipientPhone: "x".repeat(51) })).status).toBe(400);
  });
  it("closes the create, admin dispatch, rider fulfillment and customer tracking loop for free", async () => {
    const created = await create({ pickupAddress: "1", deliveryAddress: "1", recipientName: "1", recipientPhone: "1" }); expect(created.status).toBe(201);
    expect(created.body.order.pickupAddress).toBe("1");
    expect(created.body.order.deliveryAddress).toBe("1");
    expect(created.body.order.recipientPhone).toBe("1");
    const id = created.body.order.id;
    const admin = await login("admin"); const rider = await login("rider");
    const riderId = (application.db.prepare("SELECT rider_id FROM users WHERE username = 'demo_rider'").get() as { rider_id: number }).rider_id;
    const internal = await admin.get(`/api/orders/${id}`);
    expect(internal.body.order.parcelDemo.pickupCode).toBe(body.pickupCode);
    expect(internal.body.order.itemsDescription).not.toContain(body.pickupCode);
    expect(internal.body.order.merchantChargeCents).toBe(0);
    expect((await admin.post(`/api/orders/${id}/assign`).send({ riderId })).status).toBe(200);
    for (const status of ["accepted", "picked_up", "delivered"]) {
      expect((await rider.post(`/api/orders/${id}/status`).send({ status })).status).toBe(200);
      const userView = await auth(request(application.app).get(`/api/integrations/parcel-demo/orders/${id}?sourceUserId=42`));
      expect(userView.body.order.status).toBe(status);
    }
    const final = await auth(request(application.app).get(`/api/integrations/parcel-demo/orders/${id}?sourceUserId=42`));
    expect(final.body.order.events.length).toBe(5);
    expect(final.body.order.pickupCode).toBe("");
    expect((application.db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE order_id = ?").get(id) as { n: number }).n).toBe(0);
  });
  it("accepts an empty demo form and supplies clearly labelled defaults", async () => {
    const created = await auth(request(application.app).post("/api/integrations/parcel-demo/orders"))
      .send({ sourceUserId: "42", requestId: "parcel_empty_request_001" });
    expect(created.status).toBe(201);
    expect(created.body.order).toMatchObject({ campusId: 0, campusName: "演示校区（未选择）",
      pickupAddress: "演示取件地址（未填写）", deliveryAddress: "演示收件地址（未填写）",
      recipientName: "演示收件人", recipientPhone: "未填写（演示）", parcelCount: 1, feeCents: 0 });
  });
  it("deduplicates retry after a lost response and refuses conflicting retry data", async () => {
    const first = await create(); const second = await create();
    expect(second.status).toBe(200); expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.idempotent).toBe(true);
    expect((await create({ pickupCode: "different" })).status).toBe(409);
  });
  it("isolates users and hides pickup codes from list responses", async () => {
    const id = (await create()).body.order.id;
    const list = await auth(request(application.app).get("/api/integrations/parcel-demo/orders?sourceUserId=42"));
    expect(list.body.orders).toHaveLength(1); expect(list.body.orders[0].pickupCode).toBeUndefined();
    expect((await auth(request(application.app).get(`/api/integrations/parcel-demo/orders/${id}?sourceUserId=43`))).status).toBe(404);
    expect((await auth(request(application.app).post(`/api/integrations/parcel-demo/orders/${id}/cancel`)).send({ sourceUserId: "43", reason: "test" })).status).toBe(404);
    const otherMerchant = await login("merchant"); expect((await otherMerchant.get(`/api/orders/${id}`)).status).toBe(403);
  });
  it("cancels once before pickup and refuses cancellation after pickup", async () => {
    const id = (await create()).body.order.id;
    const cancel = () => auth(request(application.app).post(`/api/integrations/parcel-demo/orders/${id}/cancel`)).send({ sourceUserId: "42", reason: "测试取消" });
    expect((await cancel()).body.order.status).toBe("cancelled"); expect((await cancel()).status).toBe(200);
    const id2 = (await create({ requestId: "parcel_test_request_0002" })).body.order.id;
    const admin = await login("admin"); const rider = await login("rider");
    const riderId = (application.db.prepare("SELECT rider_id FROM users WHERE username = 'demo_rider'").get() as { rider_id: number }).rider_id;
    await admin.post(`/api/orders/${id2}/assign`).send({ riderId });
    await rider.post(`/api/orders/${id2}/status`).send({ status: "accepted" });
    await rider.post(`/api/orders/${id2}/status`).send({ status: "picked_up" });
    expect((await auth(request(application.app).post(`/api/integrations/parcel-demo/orders/${id2}/cancel`)).send({ sourceUserId: "42", reason: "too late" })).status).toBe(409);
  });
  it("limits active demo orders but still allows replay at the limit", async () => {
    for (let i = 0; i < 5; i++) expect((await create({ requestId: `parcel_test_limit_000${i}` })).status).toBe(201);
    expect((await create()).status).toBe(429);
    expect((await create({ requestId: "parcel_test_limit_0000" })).status).toBe(200);
  });
  it("cannot accidentally charge money after a pricing configuration edit", async () => {
    await create(); application.db.prepare("UPDATE pricing_rules SET minimum_fee_cents = 100 WHERE id = (SELECT pricing_rule_id FROM parcel_demo_resources)").run();
    expect((await create({ requestId: "parcel_test_request_0002" })).status).toBe(409);
  });
});
