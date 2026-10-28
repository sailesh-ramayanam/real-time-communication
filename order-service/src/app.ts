import express, { type Request, type Response } from 'express';
import { OrderEvents } from './orderEvents.js';
import type { OrderRepository } from './orderRepository.js';
import { isOrderStatus, ORDER_STATUSES, TERMINAL_STATUSES } from './orderStatus.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kept well under nginx's default 60s proxy_read_timeout.
const LONG_POLL_TIMEOUT_MS = 30_000;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function createApp(orders: OrderRepository, { logRequests }: { logRequests: boolean }) {
  const app = express();
  const orderEvents = new OrderEvents();
  app.use(express.json());

  if (logRequests) {
    app.use((req, res, next) => {
      const start = performance.now();
      res.on('finish', () => {
        const ms = (performance.now() - start).toFixed(1);
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
      });
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/orders', async (req: Request, res: Response) => {
    const { customerName, item, quantity } = req.body ?? {};
    if (!isNonEmptyString(customerName) || !isNonEmptyString(item) || !Number.isInteger(quantity) || quantity <= 0) {
      res.status(400).json({ error: 'customerName and item must be non-empty strings; quantity a positive integer' });
      return;
    }
    const order = await orders.create({ customerName: customerName.trim(), item: item.trim(), quantity });
    res.status(201).location(`/orders/${order.id}`).json(order);
  });

  // Registered before /orders/:id so "random-active" isn't treated as an id.
  app.get('/orders/random-active', async (_req, res) => {
    const id = await orders.findRandomActiveId();
    if (!id) {
      res.status(404).json({ error: 'No active orders' });
      return;
    }
    res.json({ id });
  });

  app.get('/orders/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }
    const order = await orders.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  });

  /**
   * Long polling. The client passes the last status it saw as `?status=`.
   * If the order's status already differs (or the client has none yet), the
   * order comes back immediately. Otherwise the request is held until the
   * order changes (200 with the order) or LONG_POLL_TIMEOUT_MS passes (204),
   * and the client should immediately ask again.
   */
  app.get('/orders/:id/long-poll', async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }
    const knownStatus = req.query.status;
    if (knownStatus !== undefined && !isOrderStatus(knownStatus)) {
      res.status(400).json({ error: `status must be one of ${ORDER_STATUSES.join(', ')}` });
      return;
    }

    let done = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = () => {
      done = true;
      clearTimeout(timer);
      unsubscribe();
    };

    // Subscribe before reading so an update landing between the read and the
    // subscribe isn't missed. Every update changes the status, so any event
    // is news to this client.
    const unsubscribe = orderEvents.subscribe(id, (order) => {
      if (done) return;
      finish();
      res.json(order);
    });
    // Fires when the response is sent and when the client disconnects early.
    res.on('close', finish);

    const order = await orders.findById(id);
    if (done) return;
    if (!order) {
      finish();
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.status !== knownStatus || TERMINAL_STATUSES.includes(order.status)) {
      finish();
      res.json(order);
      return;
    }

    timer = setTimeout(() => {
      finish();
      res.status(204).end();
    }, LONG_POLL_TIMEOUT_MS);
  });

  app.put('/orders/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }
    const { status } = req.body ?? {};
    if (!isOrderStatus(status)) {
      res.status(400).json({ error: `status must be one of ${ORDER_STATUSES.join(', ')}` });
      return;
    }

    const result = await orders.updateStatus(req.params.id, status);
    switch (result.kind) {
      case 'updated':
        orderEvents.publish(result.order);
        res.json(result.order);
        return;
      case 'not_found':
        res.status(404).json({ error: 'Order not found' });
        return;
      case 'invalid_transition':
        res.status(409).json({
          error: `Cannot move order from ${result.currentStatus} to ${status}`,
          currentStatus: result.currentStatus,
        });
        return;
    }
  });

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
