import type { Pool } from 'pg';
import { statusesThatCanMoveTo, TERMINAL_STATUSES, type OrderStatus } from './orderStatus.js';

export interface Order {
  id: string;
  customerName: string;
  item: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NewOrder {
  customerName: string;
  item: string;
  quantity: number;
}

export type UpdateStatusResult =
  | { kind: 'updated'; order: Order }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; currentStatus: OrderStatus };

interface OrderRow {
  id: string;
  customer_name: string;
  item: string;
  quantity: number;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
}

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  customerName: row.customer_name,
  item: row.item,
  quantity: row.quantity,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export class OrderRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: NewOrder): Promise<Order> {
    const { rows } = await this.pool.query<OrderRow>(
      `INSERT INTO orders (customer_name, item, quantity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.customerName, input.item, input.quantity],
    );
    return toOrder(rows[0]);
  }

  async findById(id: string): Promise<Order | null> {
    const { rows } = await this.pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async findRandomActiveId(): Promise<string | null> {
    // ORDER BY random() scans every active row; fine at this scale since the
    // partial index keeps the active set small.
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE status <> ALL($1::order_status[])
       ORDER BY random()
       LIMIT 1`,
      [TERMINAL_STATUSES],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Transition guard lives in the WHERE clause so concurrent writers can't
   * both "win" a read-then-write race.
   */
  async updateStatus(id: string, status: OrderStatus): Promise<UpdateStatusResult> {
    const { rows } = await this.pool.query<OrderRow>(
      `UPDATE orders
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status = ANY($3::order_status[])
       RETURNING *`,
      [id, status, statusesThatCanMoveTo(status)],
    );
    if (rows[0]) return { kind: 'updated', order: toOrder(rows[0]) };

    const existing = await this.findById(id);
    if (!existing) return { kind: 'not_found' };
    return { kind: 'invalid_transition', currentStatus: existing.status };
  }
}
