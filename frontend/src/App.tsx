import { useState } from 'react';
import { createOrder, ORDER_FLOW, type Order, type OrderStatus } from './api';
import { useOrderLongPolling } from './useOrderLongPolling';
import { useOrderShortPolling, type StatusChange } from './useOrderShortPolling';

const INTERVAL_OPTIONS = [500, 1000, 2000, 5000];

const label = (status: OrderStatus) => status.replaceAll('_', ' ').toLowerCase();

function OrderSummary({ orderId, order }: { orderId: string; order: Order | null }) {
  const currentStep = order ? ORDER_FLOW.indexOf(order.status as (typeof ORDER_FLOW)[number]) : -1;

  return (
    <>
      <div className="order-head">
        <div>
          <div className="muted small">Order</div>
          <code>{orderId}</code>
          {order && (
            <div className="muted small">
              {order.quantity} × {order.item} for {order.customerName}
            </div>
          )}
        </div>
        {order && <span className={`badge ${order.status.toLowerCase()}`}>{label(order.status)}</span>}
      </div>

      {order?.status === 'CANCELLED' ? (
        <p className="error">This order was cancelled.</p>
      ) : (
        <ol className="steps">
          {ORDER_FLOW.map((status, i) => (
            <li key={status} className={i < currentStep ? 'past' : i === currentStep ? 'current' : ''}>
              {label(status)}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function ChangeTimeline({ changes, unit }: { changes: StatusChange[]; unit: string }) {
  if (changes.length === 0) return null;
  return (
    <>
      <h3>Observed changes</h3>
      <ul className="timeline">
        {changes.map((c) => (
          <li key={`${c.status}-${c.pollNumber}`}>
            <span>{label(c.status)}</span>
            <span className="muted small">
              {c.observedAt.toLocaleTimeString()} · {unit} #{c.pollNumber}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function App() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(2000);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const short = useOrderShortPolling(orderId, intervalMs);
  const long = useOrderLongPolling(orderId);

  const createAndTrackOrder = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      setOrderId((await createOrder()).id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  // Every poll after the first that didn't reveal a new status was wasted work.
  const wastedPolls = Math.max(0, short.polls - short.changes.length);

  return (
    <main>
      <header>
        <h1>Order Tracker</h1>
        <p className="muted">Short polling and long polling, tracking the same order side by side</p>
      </header>

      <section className="controls">
        <button onClick={createAndTrackOrder} disabled={creating}>
          {creating ? 'Creating order…' : 'Create order'}
        </button>
        {orderId && !(short.done && long.done) && (
          <button className="secondary" onClick={() => setOrderId(null)}>
            Stop
          </button>
        )}
        <label>
          Short poll every{' '}
          <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
              </option>
            ))}
          </select>
        </label>
      </section>

      {createError && <p className="error">{createError}</p>}

      {orderId && (
        <section className="card">
          <h2>Short polling</h2>
          <OrderSummary orderId={orderId} order={short.order} />

          <dl className="stats">
            <div>
              <dt>Requests sent</dt>
              <dd>{short.polls}</dd>
            </div>
            <div>
              <dt>Status changes seen</dt>
              <dd>{short.changes.length}</dd>
            </div>
            <div>
              <dt>Polls with no change</dt>
              <dd>{wastedPolls}</dd>
            </div>
            <div>
              <dt>Failed polls</dt>
              <dd>{short.failedPolls}</dd>
            </div>
          </dl>

          <p className="muted small">
            {short.done ? 'Order complete; polling stopped.' : `Polling every ${intervalMs}ms.`}
            {short.lastPolledAt && ` Last poll at ${short.lastPolledAt.toLocaleTimeString()}.`}
          </p>
          {short.error && <p className="error">Last poll failed: {short.error}</p>}

          <ChangeTimeline changes={short.changes} unit="poll" />
        </section>
      )}

      {orderId && (
        <section className="card">
          <h2>Long polling</h2>
          <OrderSummary orderId={orderId} order={long.order} />

          <dl className="stats">
            <div>
              <dt>Requests sent</dt>
              <dd>{long.requests}</dd>
            </div>
            <div>
              <dt>Status changes seen</dt>
              <dd>{long.changes.length}</dd>
            </div>
            <div>
              <dt>Timed out, no change</dt>
              <dd>{long.timeouts}</dd>
            </div>
            <div>
              <dt>Failed requests</dt>
              <dd>{long.failedRequests}</dd>
            </div>
          </dl>

          <p className="muted small">
            {long.done ? 'Order complete; long polling stopped.' : 'Waiting for the server to report a change.'}
            {long.lastResponseAt && ` Last response at ${long.lastResponseAt.toLocaleTimeString()}.`}
          </p>
          {long.error && <p className="error">Last request failed: {long.error}</p>}

          <ChangeTimeline changes={long.changes} unit="request" />
        </section>
      )}
    </main>
  );
}
