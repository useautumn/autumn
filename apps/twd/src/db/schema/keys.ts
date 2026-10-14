import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeKeys = pgTable("stripe_keys", {
	platformAccountId: text("platform_account_id").primaryKey(),
	keyHash: text("key_hash").notNull().unique(),
	secretCiphertext: text("secret_ciphertext"),
	keyHint: text("key_hint").notNull(),
	displayName: text("display_name"),
	usable: boolean("usable").notNull().default(false),
	unusableReason: text("unusable_reason"),
	connectWebhookId: text("connect_webhook_id"),
	probe: jsonb("probe").$type<Record<string, unknown>>(),
	probedAt: timestamp("probed_at", { withTimezone: true }),
	present: boolean("present").notNull().default(true),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type KeyGateState = "open" | "draining";

export const keyGate = pgTable("key_gate", {
	id: text("id").primaryKey().default("global"),
	state: text("state").$type<KeyGateState>().notNull().default("open"),
	reason: text("reason"),
	jobId: text("job_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
