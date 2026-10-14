import type { ProcessorConfigs } from "@models/genModels/processorSchemas.js";
import type { PendingMigration } from "@models/migrationV2Models/pendingMigrationModel.js";
import type { AtomRoute } from "@models/orgModels/atomDeploymentTable.js";
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import type { CustomButton } from "./customButton.js";
import type { IdempotencyConfig } from "./idempotencyConfig.js";
import type { OrgConfig } from "./orgConfig.js";

export type SvixConfig = {
	sandbox_app_id: string;
	live_app_id: string;
};

export type StripeConfig = {
	test_api_key?: string | null;
	live_api_key?: string | null;
	test_webhook_secret?: string | null;
	live_webhook_secret?: string | null;
	sandbox_success_url?: string;
	success_url?: string;

	test_connect_webhook_secret?: string | null;
	live_connect_webhook_secret?: string | null;
};
export interface VersionConfig {
	sandbox?: string;
	live?: string;
}

export type StripeConnectConfig = {
	default_account_id?: string;
	account_id?: string;
	master_org_id?: string;
	connected_at?: number;
	revoked_account_id?: string;
};

export type OrgRedisConfig = {
	connectionString: string;
	publicConnectionString?: string;
	url: string;
	migrationPercent: number;
	previousMigrationPercent: number;
	migrationChangedAt: number;
};

export const OrgClaimState = {
	Pending: "pending",
	Claimed: "claimed",
	Expiring: "expiring",
} as const;

export type OrgClaimState = (typeof OrgClaimState)[keyof typeof OrgClaimState];

export const OrgProvisioningSource = {
	Agent: "agent",
} as const;

export type OrgProvisioningSource =
	(typeof OrgProvisioningSource)[keyof typeof OrgProvisioningSource];

export const organizations = pgTable(
	"organizations",
	{
		id: text().primaryKey(),
		slug: text().notNull().unique(),

		name: text("name").notNull(),
		logo: text("logo"),
		createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
		metadata: text("metadata"),

		default_currency: text("default_currency").default("usd"),

		stripe_connected: boolean("stripe_connected").default(false),
		stripe_config: jsonb("stripe_config").$type<StripeConfig>(),

		test_stripe_connect: jsonb("test_stripe_connect")
			.$type<StripeConnectConfig>()
			.default({} as StripeConnectConfig),

		live_stripe_connect: jsonb("live_stripe_connect")
			.$type<StripeConnectConfig>()
			.default({} as StripeConnectConfig),

		processor_configs: jsonb("processor_configs").$type<ProcessorConfigs>(),

		test_pkey: text("test_pkey"),
		live_pkey: text("live_pkey"),

		svix_config: jsonb("svix_config")
			.$type<SvixConfig>()
			.default(sql`'{}'::jsonb`),

		created_at: numeric({ mode: "number" }),
		config: jsonb().default({}).notNull().$type<OrgConfig>(),
		idempotency_config: jsonb(
			"idempotency_config",
		).$type<IdempotencyConfig | null>(),
		custom_buttons: jsonb("custom_buttons")
			.default(sql`'[]'::jsonb`)
			.notNull()
			.$type<CustomButton[]>(),
		created_by: text("created_by"),
		onboarded: boolean("onboarded").default(false),
		deployed: boolean("deployed").default(false),
		is_sandbox: boolean("is_sandbox").default(false).notNull(),
		sandbox_color: text("sandbox_color"),
		sandbox_icon: text("sandbox_icon"),

		redis_config: jsonb("redis_config").$type<OrgRedisConfig>(),
		provisioning_source: text(
			"provisioning_source",
		).$type<OrgProvisioningSource>(),
		claim_state: text("claim_state").$type<OrgClaimState>(),
		claim_token_hash: text("claim_token_hash"),
		claim_expires_at: timestamp("claim_expires_at", { withTimezone: true }),
	},
	(table) => [
		index("idx_organizations_name_trgm")
			.using("gin", sql`${table.name} gin_trgm_ops`)
			.where(sql`${table.name} IS NOT NULL`),
		index("idx_organizations_slug_trgm")
			.using("gin", sql`${table.slug} gin_trgm_ops`)
			.where(sql`${table.slug} IS NOT NULL`),
		index("idx_organizations_created_at_id").on(
			sql`${table.createdAt} DESC`,
			sql`${table.id} DESC`,
		),
		index("idx_organizations_pending_claim_expiry")
			.on(table.claim_expires_at)
			.where(sql`${table.claim_state} = 'pending'`),
		unique("organizations_claim_token_hash_key").on(table.claim_token_hash),
		index("idx_orgs_test_connect_default_account")
			.on(sql`(${table.test_stripe_connect}->>'default_account_id')`)
			.concurrently(),
		index("idx_orgs_test_connect_account")
			.on(sql`(${table.test_stripe_connect}->>'account_id')`)
			.concurrently(),
		index("idx_orgs_live_connect_account")
			.on(sql`(${table.live_stripe_connect}->>'account_id')`)
			.concurrently(),
		unique("organizations_test_pkey_key").on(table.test_pkey),
		unique("organizations_live_pkey_key").on(table.live_pkey),
	],
);

export type Organization = typeof organizations.$inferSelect & {
	master: Organization | null;
	pendingMigrations?: PendingMigration[];
	planAliases?: Record<string, string>;
	atomDeployments?: AtomRoute[];
};
