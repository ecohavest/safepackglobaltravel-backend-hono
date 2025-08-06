import { serve } from "@hono/node-server";
import { Hono } from "hono";
import trackingRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.get("/", (c) => {
  const env = process.env.NODE_ENV;
  return c.text(`Hello Hono! from ${env?.toUpperCase() || "Development!"}`);
});

app.route("/tracking", trackingRoutes);
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
