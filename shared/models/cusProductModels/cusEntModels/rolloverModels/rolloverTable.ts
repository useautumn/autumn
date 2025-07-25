import { z } from "zod";
import { customerEntitlements } from "../cusEntTable.js";
import {
  foreignKey,
  pgTable,
  numeric,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";

export const EntityRolloverBalanceSchema = z.object({
  id: z.string(),
  balance: z.number(),
  usage: z.number(),
});

export const RolloverSchema = z.object({
  id: z.string(),
  cus_ent_id: z.string(),
  balance: z.number(),
  usage: z.number().default(0),
  expires_at: z.number().nullable(),
  entities: z.record(z.string(), EntityRolloverBalanceSchema),
});

export const rollovers = pgTable(
  "rollovers",
  {
    id: text("id").primaryKey().notNull(),
    cus_ent_id: text("cus_ent_id").notNull(),
    balance: numeric({ mode: "number" }).notNull(),
    expires_at: numeric({ mode: "number" }),
    usage: numeric({ mode: "number" }).default(0).notNull(),
    entities: jsonb("entities")
      .$type<Record<string, EntityRolloverBalance>>()
      .notNull()
      .default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.cus_ent_id],
      foreignColumns: [customerEntitlements.id],
      name: "rollover_cus_ent_id_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),

    index("idx_rollovers_cus_ent_id").on(table.cus_ent_id),
  ]
).enableRLS();

export type Rollover = z.infer<typeof RolloverSchema>;
export type InsertRollover = typeof rollovers.$inferInsert;
export type EntityRolloverBalance = z.infer<typeof EntityRolloverBalanceSchema>;
