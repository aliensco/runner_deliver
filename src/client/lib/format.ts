import type { OrderStatus, Role } from "./types";

export const statusLabel: Record<OrderStatus, string> = {
  pending: "待派单",
  assigned: "待接单",
  accepted: "待取货",
  picked_up: "配送中",
  delivered: "已送达",
  cancelled: "已取消"
};

export const roleLabel: Record<Role, string> = {
  admin: "运营管理员",
  merchant: "商户",
  rider: "骑手"
};

export const riderStatusLabel: Record<string, string> = {
  available: "可接单",
  busy: "配送中",
  offline: "已收工"
};

export const vehicleLabel: Record<string, string> = {
  scooter: "电动车",
  bicycle: "自行车",
  car: "汽车",
  walking: "步行"
};

export function money(cents: number | null | undefined, signed = false): string {
  const value = Number(cents ?? 0) / 100;
  return `${signed && value > 0 ? "+" : ""}¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function datetime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function fullDatetime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function distance(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function apiMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const raw = String((error as { message: unknown }).message);
    const known: Record<string, string> = {
      "Invalid username or password": "账号或密码不正确",
      "Authentication required": "登录已失效，请重新登录",
      "Session is invalid or expired": "登录已过期，请重新登录",
      "Merchant balance is insufficient": "商户余额不足，无法创建订单",
      "Rider is not available for assignment": "该骑手当前不可派单",
      "Only pending orders can be edited": "只有待派单订单可以编辑",
      "Merchant has active orders": "该商户还有进行中订单，暂不能停用",
      "Rider has active orders": "该骑手还有进行中订单，暂不能变更此状态",
      "Choose another default pricing rule before disabling this one": "请先更换默认计价规则，再停用当前规则",
      "Unable to reach the server": "无法连接本地服务，请确认后端已启动"
    };
    return known[raw] ?? raw;
  }
  return "操作失败，请稍后重试";
}
