import { pgTable } from "drizzle-orm/pg-core";
import { eventColumns, eventUnique } from "./eventTable.js";

export const eventsNeon = pgTable("events", eventColumns(), (t) => [
	eventUnique(t),
]);

export const neonEventsSchema = { events: eventsNeon };
