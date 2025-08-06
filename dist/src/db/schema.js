import { text, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
export const admins = pgTable("admins", {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
});
export const trackings = pgTable("trackings", {
    id: serial("id").primaryKey(),
    trackingNumber: text("trackingNumber").notNull().unique(),
    shipDate: timestamp("shipDate"),
    deliveryDate: timestamp("deliveryDate"),
    estimatedDeliveryDate: timestamp("estimatedDeliveryDate"),
    recipientName: text("recipientName").notNull(),
    recipientPhone: text("recipientPhone").notNull(),
    destination: text("destination").notNull(),
    origin: text("origin").notNull(),
    status: text("status").notNull(),
    service: text("service").notNull(),
});
