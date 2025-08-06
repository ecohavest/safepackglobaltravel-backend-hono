import { Hono } from "hono";
import { db } from "../db/index.js";
import { admins, trackings } from "../db/schema.js";
import { eq, like } from "drizzle-orm";
import { generateTrackingNumber } from "../utils/trackingGenetayor.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;
const router = new Hono();
const verifyJwt = async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ message: "Unauthorized: Missing Bearer token" }, 401);
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        c.set("admin", decoded);
        await next();
    }
    catch (err) {
        return c.json({ message: "Unauthorized: Invalid token" }, 401);
    }
};
router.post("/login", async (c) => {
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
            console.error("Admin user object does not have an 'id' field:", adminUser);
            return c.json({ message: "Server configuration error: User ID missing." }, 500);
        }
        const token = jwt.sign({ userId: userId, username: adminUser.username }, JWT_SECRET, { expiresIn: "1h" });
        console.log("token:", token);
        return c.json({ token });
    }
    catch (error) {
        console.error("Login error:", error);
        return c.json({ message: "Server error during login" }, 500);
    }
});
router.post("/tracking", verifyJwt, async (c) => {
    try {
        const trackingNumber = generateTrackingNumber();
        const { shipDate, deliveryDate, estimatedDeliveryDate, recipientName, recipientPhone, destination, origin, status, service, } = await c.req.json();
        if (!recipientName ||
            !recipientPhone ||
            !destination ||
            !origin ||
            !status ||
            !service) {
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
    }
    catch (error) {
        console.error("Create tracking error:", error);
        if (error instanceof Error &&
            error.message.includes("UNIQUE constraint failed")) {
            return c.json({
                message: "Tracking number conflict or other unique field violation.",
            }, 409);
        }
        return c.json({ message: "Server error creating tracking" }, 500);
    }
});
router.get("/tracking", verifyJwt, async (c) => {
    try {
        const trackings = await db.query.trackings.findMany();
        return c.json(trackings);
    }
    catch (error) {
        console.error("Get all trackings error:", error);
        return c.json({ message: "Server error retrieving trackings" }, 500);
    }
});
router.get("/tracking/:trackingNumber", verifyJwt, async (c) => {
    try {
        const trackingNumber = c.req.param("trackingNumber");
        const tracking = await db.query.trackings.findFirst({
            where: eq(trackings.trackingNumber, trackingNumber),
        });
        if (!tracking) {
            return c.json({ message: "Tracking not found" }, 404);
        }
        return c.json(tracking);
    }
    catch (error) {
        console.error("Get tracking by number error:", error);
        return c.json({ message: "Server error retrieving tracking" }, 500);
    }
});
router.put("/tracking/:trackingNumber", verifyJwt, async (c) => {
    try {
        const trackingNumber = c.req.param("trackingNumber");
        const updates = await c.req.json();
        if (updates.shipDate)
            updates.shipDate = new Date(updates.shipDate);
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
    }
    catch (error) {
        console.error("Update tracking error:", error);
        return c.json({ message: "Server error updating tracking" }, 500);
    }
});
router.delete("/tracking/:trackingNumber", verifyJwt, async (c) => {
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
    }
    catch (error) {
        console.error("Delete tracking error:", error);
        return c.json({ message: "Server error deleting tracking" }, 500);
    }
});
router.get("/tracking/search/:query", verifyJwt, async (c) => {
    try {
        const query = `%${c.req.param("query")}%`;
        const results = await db
            .select()
            .from(trackings)
            .where(like(trackings.trackingNumber, query));
        return c.json(results);
    }
    catch (error) {
        console.error("Search tracking error:", error);
        return c.json({ message: "Server error searching trackings" }, 500);
    }
});
export default router;
