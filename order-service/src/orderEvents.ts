import { EventEmitter } from 'node:events';
import type { Order } from './orderRepository.js';

/**
 * In-process pub/sub for order updates, keyed by order id. Only sees updates
 * made through this process, so it works while there's a single order-service
 * instance; multiple instances would need a shared channel (e.g. Postgres
 * LISTEN/NOTIFY).
 */
export class OrderEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per waiting long-poll request or open SSE stream; many clients may watch the same order.
    this.emitter.setMaxListeners(0);
  }

  publish(order: Order) {
    this.emitter.emit(order.id, order);
  }

  /** Returns an unsubscribe function. */
  subscribe(orderId: string, listener: (order: Order) => void): () => void {
    this.emitter.on(orderId, listener);
    return () => this.emitter.off(orderId, listener);
  }
}
