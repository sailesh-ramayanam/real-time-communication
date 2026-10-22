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

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed with ${res.status}`);
  return body as T;
}

export const fetchRandomActiveOrderId = async () =>
  (await getJson<{ id: string }>('/orders/random-active')).id;

export const fetchOrder = (id: string, signal?: AbortSignal) => getJson<Order>(`/orders/${id}`, signal);
