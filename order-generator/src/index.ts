// Simulates order traffic by calling the order-service API: periodically
// creates orders and nudges random in-flight orders to their next status.

type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

interface Order {
  id: string;
  status: OrderStatus;
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PLACED: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'SHIPPED',
  SHIPPED: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};
const CANCELLABLE: readonly OrderStatus[] = ['PLACED', 'CONFIRMED', 'PREPARING'];

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const BASE_URL = process.env.ORDER_SERVICE_URL ?? 'http://order-service:3000';
const CREATE_INTERVAL_MS = numberEnv('CREATE_INTERVAL_MS', 5000);
const UPDATE_INTERVAL_MS = numberEnv('UPDATE_INTERVAL_MS', 1500);
const CANCEL_PROBABILITY = numberEnv('CANCEL_PROBABILITY', 0.05);

const CUSTOMERS = ['Asha', 'Ben', 'Chen', 'Divya', 'Elena', 'Farhan', 'Grace', 'Hiro', 'Isha', 'Jonas'];
const ITEMS = ['Laptop', 'Headphones', 'Coffee beans', 'Desk lamp', 'Running shoes', 'Backpack', 'Monitor', 'Keyboard'];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function createOrder() {
  const { status, data } = await api<Order>('POST', '/orders', {
    customerName: pick(CUSTOMERS),
    item: pick(ITEMS),
    quantity: 1 + Math.floor(Math.random() * 3),
  });
  if (status !== 201) throw new Error(`create failed with ${status}`);
  console.log(`created   ${data.id}`);
}

async function advanceRandomOrder() {
  const random = await api<{ id: string }>('GET', '/orders/random-active');
  if (random.status === 404) return;
  if (random.status !== 200) throw new Error(`random-active failed with ${random.status}`);

  const { data: order } = await api<Order>('GET', `/orders/${random.data.id}`);
  const next =
    CANCELLABLE.includes(order.status) && Math.random() < CANCEL_PROBABILITY
      ? 'CANCELLED'
      : NEXT_STATUS[order.status];
  if (!next) return;

  const update = await api<Order>('PUT', `/orders/${order.id}`, { status: next });
  if (update.status === 409) {
    // Someone else moved it between our read and write; the service rejected the stale transition.
    console.log(`conflict  ${order.id} (${order.status} -> ${next})`);
    return;
  }
  if (update.status !== 200) throw new Error(`update failed with ${update.status}`);
  console.log(`updated   ${order.id} ${order.status} -> ${next}`);
}

/** setTimeout chain rather than setInterval so slow calls never overlap. */
function every(ms: number, task: () => Promise<void>) {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`${task.name}:`, err instanceof Error ? err.message : err);
    }
    setTimeout(run, ms);
  };
  void run();
}

console.log(
  `order-generator -> ${BASE_URL} (create every ${CREATE_INTERVAL_MS}ms, update every ${UPDATE_INTERVAL_MS}ms)`,
);
every(CREATE_INTERVAL_MS, createOrder);
every(UPDATE_INTERVAL_MS, advanceRandomOrder);

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
