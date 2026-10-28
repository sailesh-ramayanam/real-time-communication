# Real-time order tracking

A playground for comparing real-time delivery techniques (short polling, long polling, SSE, WebSockets) on the same order-tracking system. Currently implemented: **short polling** and **long polling**, shown side by side for the same order.

## Services

| Service           | What it does                                                        | Port |
| ----------------- | ------------------------------------------------------------------- | ---- |
| `db`              | Postgres 16 with the `orders` table, persisted to the `pgdata` volume | 5432 |
| `order-service`   | Express + TypeScript REST API over the orders table                 | 3000 |
| `order-generator` | Background job that creates orders and advances random ones via the API | n/a |
| `frontend`        | React + TypeScript app served by nginx, which proxies `/api` to the order service | 8080 |

## Run

```sh
docker compose up --build
```

Open http://localhost:8080 and click **Track a random order**.

Reset the database (the init script runs only when the volume is empty):

```sh
docker compose down -v
```

## API

| Method | Path                    | Notes |
| ------ | ----------------------- | ----- |
| POST   | `/orders`               | Body `{ customerName, item, quantity }`, returns `201` with the order |
| PUT    | `/orders/:id`           | Body `{ status }`, returns `409` if the transition isn't allowed from the current status |
| GET    | `/orders/:id`           | Returns the order including `status` and `updatedAt` |
| GET    | `/orders/:id/long-poll?status=<last seen>` | Returns the order immediately if its status differs from `status` (or `status` is omitted); otherwise holds the request until the order changes (`200`) or 30s pass with no change (`204`) |
| GET    | `/orders/random-active` | Returns `{ id }` of a random order that isn't `DELIVERED` or `CANCELLED`, or `404` if there are none |

Status flow: `PLACED → CONFIRMED → PREPARING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`. Orders can move to `CANCELLED` before they ship.

## Things to observe

### Short polling

- `docker compose logs -f order-service` shows one log line per poll. Change the interval in the UI and watch the request rate change.
- The UI counts **polls with no change**: requests that hit the server and the database but told the client nothing new. That ratio is the core cost of short polling.
- Detection latency is up to one poll interval: compare an order's `updatedAt` with when the UI noticed the change.

### Long polling

- Requests in the log take as long as the order sat in one status (up to 30s), not a few milliseconds. Each one is an open connection held by the server.
- The UI sees each change as soon as the generator makes it, because the `PUT` handler wakes up waiting requests directly. Compare its **Observed changes** times with the short-polling card.
- Requests sent ≈ status changes + timeouts. Nearly every request carries news.
- Wake-ups are in-process (`order-service/src/orderEvents.ts`), so they only work with a single `order-service` instance. With more than one, an update on one instance wouldn't reach requests waiting on another; they'd only see it after their 30s timeout. A shared channel such as Postgres `LISTEN/NOTIFY` would fix that.
