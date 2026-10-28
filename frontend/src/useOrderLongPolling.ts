import { useEffect, useState } from 'react';
import { fetchOrderLongPoll, isTerminal, type Order, type OrderStatus } from './api';
import type { StatusChange } from './useOrderShortPolling';

export interface LongPollingState {
  order: Order | null;
  requests: number;
  /** Requests the server held until its timeout without seeing a change. */
  timeouts: number;
  failedRequests: number;
  changes: StatusChange[];
  lastResponseAt: Date | null;
  error: string | null;
  done: boolean;
}

const initialState: LongPollingState = {
  order: null,
  requests: 0,
  timeouts: 0,
  failedRequests: 0,
  changes: [],
  lastResponseAt: null,
  error: null,
  done: false,
};

const RETRY_DELAY_MS = 1000;

/**
 * Long polling: send the last status we saw and let the server hold the
 * request open until the order changes (200) or its timeout passes (204),
 * then ask again right away. Only failures wait before retrying, so a broken
 * server isn't hit in a tight loop.
 */
export function useOrderLongPolling(orderId: string | null): LongPollingState {
  const [state, setState] = useState<LongPollingState>(initialState);

  useEffect(() => {
    setState(initialState);
    if (!orderId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStatus: OrderStatus | undefined;
    let requestNumber = 0;

    const poll = async () => {
      requestNumber += 1;
      const n = requestNumber;
      let delay = 0;
      try {
        const order = await fetchOrderLongPoll(orderId, lastStatus, controller.signal);
        if (!order) {
          setState((s) => ({ ...s, requests: s.requests + 1, timeouts: s.timeouts + 1, lastResponseAt: new Date(), error: null }));
        } else {
          const changed = order.status !== lastStatus;
          lastStatus = order.status;
          setState((s) => ({
            ...s,
            order,
            requests: s.requests + 1,
            lastResponseAt: new Date(),
            error: null,
            done: isTerminal(order.status),
            changes: changed ? [...s.changes, { status: order.status, observedAt: new Date(), pollNumber: n }] : s.changes,
          }));
          if (isTerminal(order.status)) return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        delay = RETRY_DELAY_MS;
        setState((s) => ({
          ...s,
          requests: s.requests + 1,
          failedRequests: s.failedRequests + 1,
          lastResponseAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        }));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    };

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [orderId]);

  return state;
}
