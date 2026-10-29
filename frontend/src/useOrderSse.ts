import { useEffect, useState } from 'react';
import { isTerminal, orderEventsUrl, type Order, type OrderStatus } from './api';
import type { StatusChange } from './useOrderShortPolling';

export interface SseState {
  order: Order | null;
  /** Times the stream was (re)opened. More than 1 means EventSource reconnected. */
  connections: number;
  events: number;
  /** Connection drops; EventSource retries on its own unless the server refused outright. */
  errors: number;
  changes: StatusChange[];
  lastEventAt: Date | null;
  connected: boolean;
  error: string | null;
  done: boolean;
}

const initialState: SseState = {
  order: null,
  connections: 0,
  events: 0,
  errors: 0,
  changes: [],
  lastEventAt: null,
  connected: false,
  error: null,
  done: false,
};

/**
 * Server-Sent Events: open one EventSource and let the server push the order
 * on connect and on every status change. Reconnecting after a drop is built
 * into EventSource, so the hook only counts what happens. It closes the
 * stream itself on a terminal status, since EventSource would otherwise
 * reconnect when the server ends the response.
 */
export function useOrderSse(orderId: string | null): SseState {
  const [state, setState] = useState<SseState>(initialState);

  useEffect(() => {
    setState(initialState);
    if (!orderId) return;

    const source = new EventSource(orderEventsUrl(orderId));
    let lastStatus: OrderStatus | undefined;
    let eventNumber = 0;

    source.onopen = () => {
      setState((s) => ({ ...s, connections: s.connections + 1, connected: true, error: null }));
    };

    source.onmessage = (e: MessageEvent<string>) => {
      eventNumber += 1;
      const n = eventNumber;
      const order = JSON.parse(e.data) as Order;
      const changed = order.status !== lastStatus;
      lastStatus = order.status;
      if (isTerminal(order.status)) source.close();
      setState((s) => ({
        ...s,
        order,
        events: s.events + 1,
        lastEventAt: new Date(),
        connected: !isTerminal(order.status),
        done: isTerminal(order.status),
        changes: changed ? [...s.changes, { status: order.status, observedAt: new Date(), pollNumber: n }] : s.changes,
      }));
    };

    source.onerror = () => {
      // EventSource doesn't expose why; CLOSED means it gave up (e.g. a 404).
      const gaveUp = source.readyState === EventSource.CLOSED;
      setState((s) => ({
        ...s,
        errors: s.errors + 1,
        connected: false,
        error: gaveUp ? 'Server refused the stream; not retrying.' : 'Connection lost; reconnecting.',
      }));
    };

    return () => source.close();
  }, [orderId]);

  return state;
}
