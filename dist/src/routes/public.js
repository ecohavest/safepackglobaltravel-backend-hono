import { Hono } from "hono";
import { db } from "../db/index.js";
import { trackings } from "../db/schema.js";
import { eq } from "drizzle-orm";
const router = new Hono();
router.get("/:trackingNumber", async (c) => {
    try {
        const { trackingNumber } = c.req.param();
        const tracking = await db.query.trackings.findFirst({
            where: eq(trackings.trackingNumber, trackingNumber),
        });
        if (!tracking) {
            return c.json({ message: "Tracking information not found" }, 404);
        }
        return c.json(tracking);
    }
    catch (error) {
        console.error("Error fetching tracking info:", error);
        return c.json({ message: "Server error" }, 500);
    }
});
export default router;
