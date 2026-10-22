import { useState } from 'react';
import { fetchRandomActiveOrderId, ORDER_FLOW, type OrderStatus } from './api';
import { useOrderShortPolling } from './useOrderShortPolling';

const INTERVAL_OPTIONS = [500, 1000, 2000, 5000];

const label = (status: OrderStatus) => status.replaceAll('_', ' ').toLowerCase();

export default function App() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(2000);
  const [loadingId, setLoadingId] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const { order, polls, failedPolls, changes, lastPolledAt, error, done } = useOrderShortPolling(orderId, intervalMs);

  const trackRandomOrder = async () => {
    setLoadingId(true);
    setPickError(null);
    try {
      setOrderId(await fetchRandomActiveOrderId());
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingId(false);
    }
  };

  // Every poll after the first that didn't reveal a new status was wasted work.
  const wastedPolls = Math.max(0, polls - changes.length);
  const currentStep = order ? ORDER_FLOW.indexOf(order.status as (typeof ORDER_FLOW)[number]) : -1;

  return (
    <main>
      <header>
        <h1>Order Tracker</h1>
        <p className="muted">Transport: short polling</p>
      </header>

      <section className="controls">
        <button onClick={trackRandomOrder} disabled={loadingId}>
          {loadingId ? 'Finding order…' : 'Track a random order'}
        </button>
        {orderId && !done && (
          <button className="secondary" onClick={() => setOrderId(null)}>
            Stop
          </button>
        )}
        <label>
          Poll every{' '}
          <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
              </option>
            ))}
          </select>
        </label>
      </section>

      {pickError && <p className="error">{pickError}</p>}

      {orderId && (
        <section className="card">
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

          <dl className="stats">
            <div>
              <dt>Requests sent</dt>
              <dd>{polls}</dd>
            </div>
            <div>
              <dt>Status changes seen</dt>
              <dd>{changes.length}</dd>
            </div>
            <div>
              <dt>Polls with no change</dt>
              <dd>{wastedPolls}</dd>
            </div>
            <div>
              <dt>Failed polls</dt>
              <dd>{failedPolls}</dd>
            </div>
          </dl>

          <p className="muted small">
            {done ? 'Order complete; polling stopped.' : `Polling every ${intervalMs}ms.`}
            {lastPolledAt && ` Last poll at ${lastPolledAt.toLocaleTimeString()}.`}
          </p>
          {error && <p className="error">Last poll failed: {error}</p>}

          {changes.length > 0 && (
            <>
              <h2>Observed changes</h2>
              <ul className="timeline">
                {changes.map((c) => (
                  <li key={`${c.status}-${c.pollNumber}`}>
                    <span>{label(c.status)}</span>
                    <span className="muted small">
                      {c.observedAt.toLocaleTimeString()} · poll #{c.pollNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
