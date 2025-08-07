import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db } from "./db/index.js";
import { admins, trackings } from "./db/schema.js";
import { eq, like } from "drizzle-orm";
import { generateTrackingNumber } from "./utils/trackingGenetayor.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

const app = new Hono();
app.use("*", logger());

const verifyJwt = async (c: Context, next: Function) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ message: "Unauthorized: Missing Bearer token" }, 401);
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET!);
    c.set("admin", decoded);
    await next();
  } catch (err) {
    return c.json({ message: "Unauthorized: Invalid token" }, 401);
  }
};

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

app.get("/health", async (c) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Health check initiated`);

  const healthData = {
    timestamp,
    status: "checking",
    environment: {
      NODE_ENV: process.env.NODE_ENV || "undefined",
      JWT_SECRET: process.env.JWT_SECRET ? "present" : "missing",
      PORT: process.env.PORT || "3000 (default)",
    },
    database: {
      status: "unknown",
      error: null as string | null,
    },
    memory: {
      used:
        Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      total:
        Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      external:
        Math.round((process.memoryUsage().external / 1024 / 1024) * 100) / 100,
    },
    uptime: Math.round(process.uptime()),
    version: process.version,
  };

  console.log(`[${timestamp}] Environment check:`, healthData.environment);
  console.log(`[${timestamp}] Memory usage (MB):`, healthData.memory);
  console.log(`[${timestamp}] Process uptime: ${healthData.uptime} seconds`);

  try {
    console.log(`[${timestamp}] Testing database connection...`);
    const testQuery = await db.query.trackings.findMany({ limit: 1 });
    healthData.database.status = "connected";
    console.log(
      `[${timestamp}] Database connection successful. Sample query returned ${testQuery.length} records`
    );
  } catch (error) {
    healthData.database.status = "error";
    healthData.database.error =
      error instanceof Error ? error.message : String(error);
    console.error(`[${timestamp}] Database connection failed:`, error);
  }

  try {
    console.log(`[${timestamp}] Testing admin table access...`);
    const adminCount = await db.query.admins.findMany({ limit: 1 });
    console.log(
      `[${timestamp}] Admin table accessible. Found ${adminCount.length} records (limited to 1)`
    );
  } catch (error) {
    console.error(`[${timestamp}] Admin table access failed:`, error);
  }

  healthData.status =
    healthData.database.status === "connected" ? "healthy" : "unhealthy";

  console.log(
    `[${timestamp}] Health check completed. Status: ${healthData.status}`
  );

  return c.json(healthData, healthData.status === "healthy" ? 200 : 503);
});

app.get("/public/tracking/:trackingNumber", async (c) => {
  console.log("Tracking number:", c.req.param("trackingNumber"));
  try {
    const { trackingNumber } = c.req.param();

    const tracking = await db.query.trackings.findFirst({
      where: eq(trackings.trackingNumber, trackingNumber),
    });

    if (!tracking) {
      return c.json({ message: "Tracking information not found" }, 404);
    }

    return c.json(tracking);
  } catch (error) {
    console.error("Error fetching tracking info:", error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/admin/login", async (c) => {
  console.log("Login attempt:", await c.req.json());
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ message: "Username and password are required" }, 400);
    }

    const adminUser = await db.query.admins.findFirst({
      where: eq(admins.username, username),
    });
    console.log("adminUser:", adminUser);
    if (!adminUser) {
      return c.json({ message: "Invalid username or password" }, 401);
    }
    const passwordMatch = await bcrypt.compare(password, adminUser.password);
    console.log("passwordMatch:", passwordMatch);
    if (!passwordMatch) {
      return c.json({ message: "Invalid username or password" }, 401);
    }

    const userId = adminUser.id;
    console.log("userId:", userId);
    if (userId === undefined) {
      console.error(
        "Admin user object does not have an 'id' field:",
        adminUser
      );
      return c.json(
        { message: "Server configuration error: User ID missing." },
        500
      );
    }

    const token = jwt.sign(
      { userId: userId, username: adminUser.username },
      JWT_SECRET!,
      { expiresIn: "1h" }
    );
    console.log("token:", token);
    return c.json({ token });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ message: "Server error during login" }, 500);
  }
});

app.post("/admin/tracking", verifyJwt, async (c) => {
  try {
    const trackingNumber = generateTrackingNumber();

    const {
      shipDate,
      deliveryDate,
      estimatedDeliveryDate,
      recipientName,
      recipientPhone,
      destination,
      origin,
      status,
      service,
    } = await c.req.json();

    if (
      !recipientName ||
      !recipientPhone ||
      !destination ||
      !origin ||
      !status ||
      !service
    ) {
      return c.json({ message: "Missing required tracking fields" }, 400);
    }

    const newTrackingData = {
      trackingNumber,
      shipDate: shipDate ? new Date(shipDate) : new Date(),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      estimatedDeliveryDate: estimatedDeliveryDate
        ? new Date(estimatedDeliveryDate)
        : null,
      recipientName,
      recipientPhone,
      destination,
      origin,
      status,
      service,
    };

    const [createdTracking] = await db
      .insert(trackings)
      .values(newTrackingData)
      .returning();
    console.log(createdTracking);
    return c.json(createdTracking, 201);
  } catch (error) {
    console.error("Create tracking error:", error);
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return c.json(
        {
          message: "Tracking number conflict or other unique field violation.",
        },
        409
      );
    }
    return c.json({ message: "Server error creating tracking" }, 500);
  }
});

app.get("/admin/tracking", verifyJwt, async (c) => {
  try {
    const trackings = await db.query.trackings.findMany();
    return c.json(trackings);
  } catch (error) {
    console.error("Get all trackings error:", error);
    return c.json({ message: "Server error retrieving trackings" }, 500);
  }
});

app.get("/admin/tracking/:trackingNumber", verifyJwt, async (c) => {
  try {
    const trackingNumber = c.req.param("trackingNumber");
    const tracking = await db.query.trackings.findFirst({
      where: eq(trackings.trackingNumber, trackingNumber),
    });

    if (!tracking) {
      return c.json({ message: "Tracking not found" }, 404);
    }
    return c.json(tracking);
  } catch (error) {
    console.error("Get tracking by number error:", error);
    return c.json({ message: "Server error retrieving tracking" }, 500);
  }
});

app.put("/admin/tracking/:trackingNumber", verifyJwt, async (c) => {
  try {
    const trackingNumber = c.req.param("trackingNumber");
    const updates = await c.req.json();

    if (updates.shipDate) updates.shipDate = new Date(updates.shipDate);
    if (updates.deliveryDate)
      updates.deliveryDate = new Date(updates.deliveryDate);
    if (updates.estimatedDeliveryDate)
      updates.estimatedDeliveryDate = new Date(updates.estimatedDeliveryDate);

    delete updates.trackingNumber;
    delete updates.id;

    const [updatedTracking] = await db
      .update(trackings)
      .set(updates)
      .where(eq(trackings.trackingNumber, trackingNumber))
      .returning();

    if (!updatedTracking) {
      return c.json({ message: "Tracking not found" }, 404);
    }
    return c.json(updatedTracking);
  } catch (error) {
    console.error("Update tracking error:", error);
    return c.json({ message: "Server error updating tracking" }, 500);
  }
});

app.delete("/admin/tracking/:trackingNumber", verifyJwt, async (c) => {
  try {
    const trackingNumber = c.req.param("trackingNumber");
    const result = await db
      .delete(trackings)
      .where(eq(trackings.trackingNumber, trackingNumber))
      .returning({ id: trackings.id });

    if (result.length === 0) {
      return c.json({ message: "Tracking not found" }, 404);
    }
    return c.json({ message: "Tracking deleted successfully" });
  } catch (error) {
    console.error("Delete tracking error:", error);
    return c.json({ message: "Server error deleting tracking" }, 500);
  }
});

app.get("/admin/tracking/search/:query", verifyJwt, async (c) => {
  try {
    const query = `%${c.req.param("query")}%`;
    const results = await db
      .select()
      .from(trackings)
      .where(like(trackings.trackingNumber, query));

    return c.json(results);
  } catch (error) {
    console.error("Search tracking error:", error);
    return c.json({ message: "Server error searching trackings" }, 500);
  }
});

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
