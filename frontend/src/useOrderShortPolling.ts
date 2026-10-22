import { useEffect, useRef, useState } from 'react';
import { fetchOrder, isTerminal, type Order, type OrderStatus } from './api';

export interface StatusChange {
  status: OrderStatus;
  observedAt: Date;
  /** How many polls it took to notice this change. */
  pollNumber: number;
}

export interface PollingState {
  order: Order | null;
  polls: number;
  failedPolls: number;
  changes: StatusChange[];
  lastPolledAt: Date | null;
  error: string | null;
  done: boolean;
}

const initialState: PollingState = {
  order: null,
  polls: 0,
  failedPolls: 0,
  changes: [],
  lastPolledAt: null,
  error: null,
  done: false,
};

/**
 * Short polling: ask the server for the order every `intervalMs`, whether or
 * not anything changed, until the order reaches a terminal status.
 *
 * Uses a setTimeout chain (not setInterval) so a slow response never causes
 * overlapping requests. The interval is read through a ref so changing it
 * mid-track doesn't restart polling.
 */
export function useOrderShortPolling(orderId: string | null, intervalMs: number): PollingState {
  const [state, setState] = useState<PollingState>(initialState);
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    setState(initialState);
    if (!orderId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStatus: OrderStatus | undefined;
    let pollNumber = 0;

    const poll = async () => {
      pollNumber += 1;
      try {
        const order = await fetchOrder(orderId, controller.signal);
        const changed = order.status !== lastStatus;
        lastStatus = order.status;
        const n = pollNumber;
        setState((s) => ({
          ...s,
          order,
          polls: s.polls + 1,
          lastPolledAt: new Date(),
          error: null,
          done: isTerminal(order.status),
          changes: changed ? [...s.changes, { status: order.status, observedAt: new Date(), pollNumber: n }] : s.changes,
        }));
        if (isTerminal(order.status)) return;
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          polls: s.polls + 1,
          failedPolls: s.failedPolls + 1,
          lastPolledAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        }));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, intervalRef.current);
    };

    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [orderId]);

  return state;
}
