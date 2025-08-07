import { serve } from "@hono/node-server";
import { Hono } from "hono";
import trackingRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();
app.use("*", logger());

app.use(
  "/*",
  cors({
    origin: (origin, c) => {
      console.log(origin);
      return origin.endsWith(".safepackglobaltravel.com")
        ? origin
        : "https://safepackglobaltravel.com";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: [
      "Content-Length",
      "X-Custom-Header",
      "Allow-Access-Control-Origin",
    ],
    credentials: true,
  })
);

app.get("/", (c) => {
  const env = process.env.NODE_ENV;
  console.log("Hello Hono! from ", env?.toUpperCase() || "Development!");
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
    console.log("Ready to serve on port 3000");
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
