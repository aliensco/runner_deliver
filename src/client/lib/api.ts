import type * as Types from "./types";

const API_ROOT = `${import.meta.env.BASE_URL}api`;

export interface ApiRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;

  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "NETWORK_ERROR", "Unable to reach the server", cause);
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const code = typeof error?.code === "string" ? error.code : "HTTP_ERROR";
    const message =
      typeof error?.message === "string"
        ? error.message
        : typeof body === "string" && body
          ? body
          : response.statusText || `Request failed (${response.status})`;
    throw new ApiError(response.status, code, message, error?.details);
  }

  return body as T;
}

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, params?: Record<string, QueryValue>): string {
  if (!params) return path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function requestOptions(options?: ApiRequestOptions): Pick<RequestInit, "signal" | "headers"> {
  return {
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.headers ? { headers: options.headers } : {})
  };
}

function get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, requestOptions(options));
}

function send<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>(path, {
    method,
    body: JSON.stringify(body),
    ...requestOptions(options)
  });
}

function login(
  input: Types.LoginInput,
  options?: ApiRequestOptions
): Promise<Types.AuthResponse>;
function login(
  username: string,
  password: string,
  options?: ApiRequestOptions
): Promise<Types.AuthResponse>;
function login(
  inputOrUsername: Types.LoginInput | string,
  passwordOrOptions?: string | ApiRequestOptions,
  maybeOptions?: ApiRequestOptions
): Promise<Types.AuthResponse> {
  const input =
    typeof inputOrUsername === "string"
      ? { username: inputOrUsername, password: String(passwordOrOptions ?? "") }
      : inputOrUsername;
  const options =
    typeof inputOrUsername === "string"
      ? maybeOptions
      : (passwordOrOptions as ApiRequestOptions | undefined);
  return send<Types.AuthResponse>("/auth/login", "POST", input, options);
}

function logout(options?: ApiRequestOptions): Promise<void> {
  return apiRequest<void>("/auth/logout", {
    method: "POST",
    ...requestOptions(options)
  });
}

function listOrders(
  params: Types.OrdersListParams = {},
  options?: ApiRequestOptions
): Promise<Types.OrdersListResponse> {
  return get<Types.OrdersListResponse>(
    withQuery("/orders", params as Record<string, QueryValue>),
    options
  );
}

function assignOrder(
  id: number,
  rider: number | Types.AssignOrderInput,
  options?: ApiRequestOptions
): Promise<Types.OrderResponse> {
  const input = typeof rider === "number" ? { riderId: rider } : rider;
  return send<Types.OrderResponse>(`/orders/${id}/assign`, "POST", input, options);
}

function createLedgerAdjustment(
  input: Types.CreateLedgerAdjustmentInput,
  options?: ApiRequestOptions
): Promise<Types.LedgerAdjustmentResponse> {
  return send<Types.LedgerAdjustmentResponse>("/ledger/adjustments", "POST", input, options);
}

export const api = {
  auth: {
    login,
    me: (options?: ApiRequestOptions) => get<Types.AuthResponse>("/auth/me", options),
    logout
  },

  dashboard: {
    get: (options?: ApiRequestOptions) => get<Types.DashboardData>("/dashboard", options)
  },

  orders: {
    list: listOrders,
    get: (id: number, options?: ApiRequestOptions) =>
      get<Types.OrderResponse>(`/orders/${id}`, options),
    events: (id: number, options?: ApiRequestOptions) =>
      get<Types.OrderEventsResponse>(`/orders/${id}/events`, options),
    create: (input: Types.CreateOrderInput, options?: ApiRequestOptions) =>
      send<Types.OrderResponse>("/orders", "POST", input, options),
    update: (id: number, input: Types.UpdateOrderInput, options?: ApiRequestOptions) =>
      send<Types.OrderResponse>(`/orders/${id}`, "PATCH", input, options),
    assign: assignOrder,
    changeStatus: (
      id: number,
      input: Types.ChangeOrderStatusInput,
      options?: ApiRequestOptions
    ) => send<Types.ChangeOrderStatusResponse>(`/orders/${id}/status`, "POST", input, options)
  },

  merchants: {
    list: (options?: ApiRequestOptions) =>
      get<Types.MerchantsListResponse>("/merchants", options),
    get: (id: number, options?: ApiRequestOptions) =>
      get<Types.MerchantResponse>(`/merchants/${id}`, options),
    create: (input: Types.CreateMerchantInput, options?: ApiRequestOptions) =>
      send<Types.MerchantResponse>("/merchants", "POST", input, options),
    update: (id: number, input: Types.UpdateMerchantInput, options?: ApiRequestOptions) =>
      send<Types.MerchantResponse>(`/merchants/${id}`, "PATCH", input, options)
  },

  riders: {
    list: (options?: ApiRequestOptions) => get<Types.RidersListResponse>("/riders", options),
    get: (id: number, options?: ApiRequestOptions) =>
      get<Types.RiderResponse>(`/riders/${id}`, options),
    create: (input: Types.CreateRiderInput, options?: ApiRequestOptions) =>
      send<Types.RiderResponse>("/riders", "POST", input, options),
    update: (id: number, input: Types.UpdateRiderInput, options?: ApiRequestOptions) =>
      send<Types.RiderResponse>(`/riders/${id}`, "PATCH", input, options)
  },

  pricingRules: {
    list: (options?: ApiRequestOptions) =>
      get<Types.PricingRulesListResponse>("/pricing-rules", options),
    get: (id: number, options?: ApiRequestOptions) =>
      get<Types.PricingRuleResponse>(`/pricing-rules/${id}`, options),
    create: (input: Types.CreatePricingRuleInput, options?: ApiRequestOptions) =>
      send<Types.PricingRuleResponse>("/pricing-rules", "POST", input, options),
    update: (id: number, input: Types.UpdatePricingRuleInput, options?: ApiRequestOptions) =>
      send<Types.PricingRuleResponse>(`/pricing-rules/${id}`, "PATCH", input, options)
  },

  ledger: {
    list: (params: Types.LedgerListParams = {}, options?: ApiRequestOptions) =>
      get<Types.LedgerListResponse>(
        withQuery("/ledger", params as Record<string, QueryValue>),
        options
      ),
    adjust: createLedgerAdjustment,
    createAdjustment: createLedgerAdjustment
  },

  settings: {
    get: (options?: ApiRequestOptions) => get<Types.SettingsResponse>("/settings", options),
    update: (input: Types.UpdateSettingsInput, options?: ApiRequestOptions) =>
      send<Types.SettingsResponse>("/settings", "PATCH", input, options)
  }
} as const;

export default api;
