import { pgTable } from "drizzle-orm/pg-core";
import { eventColumns, eventUnique } from "./eventTable.js";

// Neon variant: same columns + dedup constraint. NO customers FK (no customers table on Neon),
// no query indexes. PK(id) = replica identity for CDC update/delete propagation.
export const eventsNeon = pgTable("events", eventColumns(), (t) => [
	eventUnique(t),
]);

export const neonEventsSchema = { events: eventsNeon };
