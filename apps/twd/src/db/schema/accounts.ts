import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { stripeKeys } from "./keys.ts";

export type AccountState = "clean" | "in_use" | "nuking" | "broken";

export const stripeAccounts = pgTable(
	"stripe_accounts",
	{
		/** Stripe connected account id (acct_…). */
		id: text("id").primaryKey(),
		platformAccountId: text("platform_account_id")
			.notNull()
			.references(() => stripeKeys.platformAccountId),
		state: text("state").$type<AccountState>().notNull().default("clean"),
		/** Set while in_use. */
		heldBy: text("held_by"),
		runId: text("run_id"),
		lastNukedAt: timestamp("last_nuked_at", { withTimezone: true }),
		brokenReason: text("broken_reason"),
		stateChangedAt: timestamp("state_changed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("stripe_accounts_state_idx").on(t.state, t.platformAccountId)],
);
