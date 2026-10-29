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

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  return res;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request(path, { signal })).json() as Promise<T>;
}

const CUSTOMERS = ['Asha', 'Ben', 'Chen', 'Divya', 'Elena', 'Farhan', 'Grace', 'Hiro', 'Isha', 'Jonas'];
const ITEMS = ['Laptop', 'Headphones', 'Coffee beans', 'Desk lamp', 'Running shoes', 'Backpack', 'Monitor', 'Keyboard'];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Creates an order with randomized details and returns it. */
export async function createOrder() {
  const res = await request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: pick(CUSTOMERS),
      item: pick(ITEMS),
      quantity: 1 + Math.floor(Math.random() * 3),
    }),
  });
  return (await res.json()) as Order;
}

export const fetchOrder = (id: string, signal?: AbortSignal) => getJson<Order>(`/orders/${id}`, signal);

/**
 * Resolves with the order once its status differs from `knownStatus`, or
 * with null if the server's wait timed out with no change (204).
 */
export async function fetchOrderLongPoll(id: string, knownStatus: OrderStatus | undefined, signal?: AbortSignal) {
  const query = knownStatus ? `?status=${knownStatus}` : '';
  const res = await request(`/orders/${id}/long-poll${query}`, { signal });
  return res.status === 204 ? null : ((await res.json()) as Order);
}
