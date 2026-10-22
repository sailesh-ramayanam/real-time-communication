import express, { type Request, type Response } from 'express';
import type { OrderRepository } from './orderRepository.js';
import { isOrderStatus, ORDER_STATUSES } from './orderStatus.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function createApp(orders: OrderRepository, { logRequests }: { logRequests: boolean }) {
  const app = express();
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
