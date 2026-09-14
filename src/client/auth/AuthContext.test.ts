import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it.each(["/", "/runner-demo/"])("auth provider uses the deployed base %s for every session request", async (base) => {
  vi.stubEnv("BASE_URL", base);
  vi.resetModules();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { id: 1, role: "admin" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { AuthProvider, useAuth } = await import("./AuthContext");
  let auth!: ReturnType<typeof useAuth>;
  function Probe() { auth = useAuth(); return null; }
  renderToString(createElement(AuthProvider, { children: createElement(Probe) }));
  await auth.refresh();
  await auth.login("test_admin", "test_password");
  await auth.logout();
  expect(fetchMock.mock.calls).toEqual([
    [`${base}api/auth/me`, expect.objectContaining({ credentials: "include" })],
    [`${base}api/auth/login`, expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "test_admin", password: "test_password" }), credentials: "include" })],
    [`${base}api/auth/logout`, expect.objectContaining({ method: "POST", credentials: "include" })]
  ]);
});
