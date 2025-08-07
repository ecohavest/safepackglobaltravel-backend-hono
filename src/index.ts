import { serve } from "@hono/node-server";
import { Hono } from "hono";
import trackingRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: (origin, c) => {
      return origin.endsWith(".safepackglobaltravel.com")
        ? origin
        : "http://localhost:4173";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use("*", logger());

app.get("/", (c) => {
  const env = process.env.NODE_ENV;
  return c.text(`Hello Hono! from ${env?.toUpperCase() || "Development!"}`);
});

app.route("/public/tracking", trackingRoutes);
app.route("/admin", adminRoutes);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
