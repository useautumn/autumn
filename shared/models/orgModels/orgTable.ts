import { sql } from "drizzle-orm";
import {
	boolean,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import type { OrgConfig } from "./orgConfig.js";

export type SvixConfig = {
	sandbox_app_id: string;
	live_app_id: string;
};

export type StripeConfig = {
	test_api_key?: string;
	live_api_key?: string;
	test_webhook_secret?: string;
	live_webhook_secret?: string;
	sandbox_success_url?: string;
	success_url?: string;

	test_connect_webhook_secret?: string;
	live_connect_webhook_secret?: string;
};

export type OrgProcessorConfig = {
	success_url: string;
};

export interface VersionConfig {
	sandbox?: string;
	live?: string;
	// sandbox_webhooks: string;
	// live_webhooks: string;
}

export type StripeConnectConfig = {
	default_account_id?: string;
	account_id?: string;
	master_org_id?: string;
};

export const organizations = pgTable(
	"organizations",
	{
		id: text().primaryKey(),
		slug: text().notNull().unique(),

		// Better Auth
		name: text("name").notNull(),
		logo: text("logo"),
		createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
		metadata: text("metadata"),

		// Stripe
		default_currency: text("default_currency").default("usd"),

		stripe_connected: boolean("stripe_connected").default(false),
		stripe_config: jsonb("stripe_config").$type<StripeConfig>(),

		test_stripe_connect: jsonb("test_stripe_connect")
			.$type<StripeConnectConfig>()
			.default({} as StripeConnectConfig),

		live_stripe_connect: jsonb("live_stripe_connect")
			.$type<StripeConnectConfig>()
			.default({} as StripeConnectConfig),

		// stripe_connect: jsonb("stripe_connect")
		// 	.$type<StripeConnectConfig>()
		// 	.default({} as StripeConnectConfig)
		// 	.notNull(),

		test_pkey: text("test_pkey"),
		live_pkey: text("live_pkey"),

		svix_config: jsonb("svix_config")
			.$type<SvixConfig>()
			.default(sql`'{}'::jsonb`),

		created_at: numeric({ mode: "number" }),
		config: jsonb().default({}).notNull().$type<OrgConfig>(),
		created_by: text("created_by"),
		onboarded: boolean("onboarded").default(false),
	},
	(table) => [
		unique("organizations_test_pkey_key").on(table.test_pkey),
		unique("organizations_live_pkey_key").on(table.live_pkey),
	],
);

export type Organization = typeof organizations.$inferSelect & {
	master: Organization | null;
};

// Multi tenancy flow <-> stripe connect...
// Create org in Autumn, don't need stripe connect key, we create an Autumn connect account for them.
// Connect own stripe to sandbox / prod
// 1. OAuth to link their stripe account (?) -> need to use access token though
// 2. Paste in their secret key
// 3. Onboard onto Stripe connect (?)
