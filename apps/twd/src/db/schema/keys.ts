import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** One row per TW_V3_KEYS entry, keyed by the platform account it belongs to. */
export const stripeKeys = pgTable("stripe_keys", {
	platformAccountId: text("platform_account_id").primaryKey(),
	/** sha256 of the secret; the secret itself only ever lives in TW_V3_KEYS. */
	keyHash: text("key_hash").notNull().unique(),
	/** `sk_test_…a1f2` style display hint. */
	keyHint: text("key_hint").notNull(),
	displayName: text("display_name"),
	usable: boolean("usable").notNull().default(false),
	unusableReason: text("unusable_reason"),
	connectWebhookId: text("connect_webhook_id"),
	probe: jsonb("probe").$type<Record<string, unknown>>(),
	probedAt: timestamp("probed_at", { withTimezone: true }),
	/** false once the key disappears from TW_V3_KEYS. */
	present: boolean("present").notNull().default(true),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type KeyGateState = "open" | "draining";

/** Single-row gate: `draining` rejects new swarms during a key re-init. */
export const keyGate = pgTable("key_gate", {
	id: text("id").primaryKey().default("global"),
	state: text("state").$type<KeyGateState>().notNull().default("open"),
	reason: text("reason"),
	jobId: text("job_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
