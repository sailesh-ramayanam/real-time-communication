-- Runs once, only when the Postgres data volume is empty.

CREATE TYPE order_status AS ENUM (
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED'
);

CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT         NOT NULL,
  item          TEXT         NOT NULL,
  quantity      INTEGER      NOT NULL CHECK (quantity > 0),
  status        order_status NOT NULL DEFAULT 'PLACED',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Partial index over in-flight orders: keeps "pick a random active order" cheap
-- as completed orders pile up.
CREATE INDEX orders_active_idx ON orders (id)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED');
