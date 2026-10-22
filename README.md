# Real-time order tracking

A playground for comparing real-time delivery techniques (short polling, long polling, SSE, WebSockets) on the same order-tracking system. Currently implemented: **short polling**.

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
| GET    | `/orders/random-active` | Returns `{ id }` of a random order that isn't `DELIVERED` or `CANCELLED`, or `404` if there are none |

Status flow: `PLACED → CONFIRMED → PREPARING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`. Orders can move to `CANCELLED` before they ship.

## Things to observe

- `docker compose logs -f order-service` shows one log line per poll. Change the interval in the UI and watch the request rate change.
- The UI counts **polls with no change**: requests that hit the server and the database but told the client nothing new. That ratio is the core cost of short polling.
- Detection latency is up to one poll interval: compare an order's `updatedAt` with when the UI noticed the change.
