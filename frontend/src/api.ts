export const ORDER_FLOW = ['PLACED', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

export type OrderStatus = (typeof ORDER_FLOW)[number] | 'CANCELLED';

export const isTerminal = (status: OrderStatus) => status === 'DELIVERED' || status === 'CANCELLED';

export interface Order {
  id: string;
  customerName: string;
  item: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = '/api';

async function request(path: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  return res;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request(path, signal)).json() as Promise<T>;
}

export const fetchRandomActiveOrderId = async () =>
  (await getJson<{ id: string }>('/orders/random-active')).id;

export const fetchOrder = (id: string, signal?: AbortSignal) => getJson<Order>(`/orders/${id}`, signal);

/**
 * Resolves with the order once its status differs from `knownStatus`, or
 * with null if the server's wait timed out with no change (204).
 */
export async function fetchOrderLongPoll(id: string, knownStatus: OrderStatus | undefined, signal?: AbortSignal) {
  const query = knownStatus ? `?status=${knownStatus}` : '';
  const res = await request(`/orders/${id}/long-poll${query}`, signal);
  return res.status === 204 ? null : ((await res.json()) as Order);
}
