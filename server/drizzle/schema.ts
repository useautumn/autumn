import { pgTable, foreignKey, unique, text, numeric, jsonb, boolean, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const apiKeys = pgTable("api_keys", {
	id: text().primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	name: text(),
	prefix: text(),
	orgId: text("org_id"),
	userId: text("user_id"),
	env: text(),
	hashedKey: text("hashed_key").default(gen_random_uuid()),
	meta: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "api_keys_org_id_fkey"
		}).onDelete("cascade"),
	unique("api_keys_hashed_key_key").on(table.hashedKey),
]);

export const rewards = pgTable("rewards", {
	internalId: text("internal_id").primaryKey().notNull(),
	env: text(),
	name: text(),
	orgId: text("org_id"),
	createdAt: numeric("created_at"),
	discountConfig: jsonb("discount_config"),
	freeProductId: text("free_product_id"),
	id: text(),
	promoCodes: jsonb("promo_codes").array(),
	type: text(),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "coupons_org_id_fkey"
		}).onDelete("cascade"),
]);

export const rewardPrograms = pgTable("reward_programs", {
	internalId: text("internal_id").primaryKey().notNull(),
	id: text(),
	createdAt: numeric("created_at").notNull(),
	internalRewardId: text("internal_reward_id"),
	maxRedemptions: numeric("max_redemptions"),
	unlimitedRedemptions: boolean("unlimited_redemptions").default(false),
	orgId: text("org_id"),
	env: text(),
	when: text().default('immediately'),
	productIds: text("product_ids").array().default([""]),
	excludeTrial: boolean("exclude_trial").default(false),
	receivedBy: text("received_by"),
}, (table) => [
	foreignKey({
			columns: [table.internalRewardId],
			foreignColumns: [rewards.internalId],
			name: "reward_triggers_internal_reward_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "reward_triggers_org_id_fkey"
		}).onDelete("cascade"),
]);


export const entities = pgTable("entities", {
	internalId: text("internal_id").primaryKey().notNull(),
	orgId: text("org_id"),
	env: text(),
	internalCustomerId: text("internal_customer_id"),
	createdAt: numeric("created_at").notNull(),
	id: text(),
	name: text(),
	deleted: boolean().default(false).notNull(),
	internalFeatureId: text("internal_feature_id"),
	featureId: text("feature_id"),
}, (table) => [
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "entities_internal_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.internalFeatureId],
			foreignColumns: [features.internalId],
			name: "entities_internal_feature_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "entities_org_id_fkey"
		}).onDelete("cascade"),
	unique("entity_id_constraint").on(table.orgId, table.env, table.internalCustomerId, table.id),
]);

export const entitlements = pgTable("entitlements", {
	createdAt: numeric("created_at").notNull(),
	internalFeatureId: text("internal_feature_id"),
	orgId: text("org_id"),
	internalProductId: text("internal_product_id"),
	allowanceType: text("allowance_type"),
	allowance: numeric(),
	interval: text(),
	id: text().primaryKey().notNull(),
	featureId: text("feature_id"),
	isCustom: boolean("is_custom").default(false),
	carryFromPrevious: boolean("carry_from_previous").default(false),
	entityFeatureId: text("entity_feature_id"),
}, (table) => [
	foreignKey({
			columns: [table.internalFeatureId],
			foreignColumns: [features.internalId],
			name: "entitlements_internal_feature_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.internalProductId],
			foreignColumns: [products.internalId],
			name: "entitlements_internal_product_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	unique("entitlements_id_key").on(table.id),
]);

export const events = pgTable("events", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	timestamp: numeric().notNull(),
	env: text().notNull(),
	customerId: text("customer_id").notNull(),
	eventName: text("event_name").notNull(),
	properties: jsonb(),
	idempotencyKey: text("idempotency_key"),
	internalCustomerId: text("internal_customer_id"),
	value: numeric(),
	setUsage: boolean("set_usage").default(false),
	entityId: text("entity_id"),
}, (table) => [
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "events_internal_customer_id_fkey"
		}).onDelete("cascade"),
	unique("unique_event_constraint").on(table.orgId, table.env, table.customerId, table.eventName, table.idempotencyKey),
]);

export const freeTrials = pgTable("free_trials", {
	id: text().primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	duration: text().default('day'),
	length: numeric(),
	internalProductId: text("internal_product_id"),
	uniqueFingerprint: boolean("unique_fingerprint"),
	isCustom: boolean("is_custom").default(false),
}, (table) => [
	foreignKey({
			columns: [table.internalProductId],
			foreignColumns: [products.internalId],
			name: "free_trials_internal_product_id_fkey"
		}).onDelete("cascade"),
]);

export const invoiceItems = pgTable("invoice_items", {
	createdAt: numeric("created_at").notNull(),
	updatedAt: numeric("updated_at"),
	customerPriceId: text("customer_price_id"),
	periodStart: numeric("period_start"),
	periodEnd: numeric("period_end"),
	prorationStart: numeric("proration_start"),
	prorationEnd: numeric("proration_end"),
	quantity: numeric(),
	amount: numeric(),
	currency: text(),
	id: text().primaryKey().notNull(),
	addedToStripe: boolean("added_to_stripe").default(false),
	customerId: text("customer_id"),
}, (table) => [
	foreignKey({
			columns: [table.customerPriceId],
			foreignColumns: [customerPrices.id],
			name: "invoice_items_customer_price_id_fkey"
		}).onDelete("cascade"),
	unique("invoice_items_id_key").on(table.id),
]);

export const customers = pgTable("customers", {
	name: text().default('),
	orgId: text("org_id").notNull(),
	createdAt: numeric("created_at").notNull(),
	internalId: text("internal_id").primaryKey().notNull(),
	id: text(),
	env: text(),
	processor: jsonb(),
	email: text().default('),
	fingerprint: text(),
	metadata: jsonb().default({}),
}, (table) => [
	unique("cus_id_constraint").on(table.orgId, table.id, table.env),
]);

export const features = pgTable("features", {
	internalId: text("internal_id").primaryKey().notNull(),
	orgId: text("org_id"),
	id: text().notNull(),
	name: text(),
	type: text(),
	createdAt: numeric("created_at").default('sql`(date_part('epoch'::text, now()) * (1000)::double precision)`'),
	config: jsonb(),
	env: text().default('live'),
	display: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "features_org_id_fkey"
		}).onDelete("cascade"),
	unique("feature_id_constraint").on(table.orgId, table.id, table.env),
]);

export const customerProducts = pgTable("customer_products", {
	id: text().primaryKey().notNull(),
	internalCustomerId: text("internal_customer_id").notNull(),
	customerId: text("customer_id"),
	internalProductId: text("internal_product_id"),
	createdAt: numeric("created_at"),
	status: text(),
	processor: jsonb(),
	canceledAt: numeric("canceled_at"),
	endedAt: numeric("ended_at"),
	startsAt: numeric("starts_at"),
	options: jsonb().array(),
	productId: text("product_id"),
	freeTrialId: text("free_trial_id"),
	trialEndsAt: numeric("trial_ends_at"),
	collectionMethod: text("collection_method").default('charge_automatically'),
	subscriptionIds: text("subscription_ids").array(),
	scheduledIds: text("scheduled_ids").array(),
	isCustom: boolean("is_custom").default(false).notNull(),
	quantity: numeric().default('1'),
	internalEntityId: text("internal_entity_id"),
	entityId: text("entity_id"),
}, (table) => [
	foreignKey({
			columns: [table.freeTrialId],
			foreignColumns: [freeTrials.id],
			name: "customer_products_free_trial_id_fkey"
		}),
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "customer_products_internal_customer_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.internalEntityId],
			foreignColumns: [entities.internalId],
			name: "customer_products_internal_entity_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.internalProductId],
			foreignColumns: [products.internalId],
			name: "customer_products_internal_product_id_fkey"
		}),
]);

export const metadata = pgTable("metadata", {
	id: text().primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	expiresAt: numeric("expires_at"),
	data: jsonb(),
});

export const organizations = pgTable("organizations", {
	id: text().primaryKey().notNull(),
	slug: text().notNull(),
	defaultCurrency: text("default_currency"),
	stripeConnected: boolean("stripe_connected"),
	stripeConfig: jsonb("stripe_config"),
	testPkey: text("test_pkey"),
	livePkey: text("live_pkey"),
	svixConfig: jsonb("svix_config"),
	createdAt: numeric("created_at"),
	config: jsonb().default({}),
}, (table) => [
	unique("organizations_test_pkey_key").on(table.testPkey),
	unique("organizations_live_pkey_key").on(table.livePkey),
]);

export const prices = pgTable("prices", {
	createdAt: numeric("created_at").notNull(),
	config: jsonb(),
	orgId: text("org_id"),
	internalProductId: text("internal_product_id"),
	id: text().primaryKey().notNull(),
	name: text(),
	billingType: text("billing_type"),
	isCustom: boolean("is_custom").default(false),
	entitlementId: text("entitlement_id"),
}, (table) => [
	foreignKey({
			columns: [table.entitlementId],
			foreignColumns: [entitlements.id],
			name: "prices_entitlement_id_fkey"
		}),
	foreignKey({
			columns: [table.internalProductId],
			foreignColumns: [products.internalId],
			name: "prices_internal_product_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	unique("prices_id_key").on(table.id),
]);

export const products = pgTable("products", {
	internalId: text("internal_id").primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	name: text(),
	orgId: text("org_id"),
	env: text(),
	isAddOn: boolean("is_add_on"),
	processor: jsonb(),
	isDefault: boolean("is_default").default(false),
	id: text(),
	group: text().default('),
	version: numeric().default('1'),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "products_org_id_fkey"
		}).onDelete("cascade"),
	unique("unique_product").on(table.orgId, table.env, table.id, table.version),
]);

export const rewardRedemptions = pgTable("reward_redemptions", {
	id: text().primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	updatedAt: numeric("updated_at"),
	internalCustomerId: text("internal_customer_id"),
	triggered: boolean(),
	internalRewardProgramId: text("internal_reward_program_id"),
	applied: boolean().default(false),
	referralCodeId: text("referral_code_id"),
}, (table) => [
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "reward_redemptions_internal_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.internalRewardProgramId],
			foreignColumns: [rewardPrograms.internalId],
			name: "reward_redemptions_internal_reward_program_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.referralCodeId],
			foreignColumns: [referralCodes.id],
			name: "reward_redemptions_referral_code_id_fkey"
		}).onDelete("cascade"),
]);

export const migrationJobs = pgTable("migration_jobs", {
	id: text().primaryKey().notNull(),
	createdAt: numeric("created_at").notNull(),
	updatedAt: numeric("updated_at"),
	currentStep: text("current_step"),
	fromInternalProductId: text("from_internal_product_id"),
	toInternalProductId: text("to_internal_product_id"),
	stepDetails: jsonb("step_details"),
	orgId: text("org_id"),
	env: text(),
}, (table) => [
	foreignKey({
			columns: [table.fromInternalProductId],
			foreignColumns: [products.internalId],
			name: "migration_jobs_from_internal_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "migration_jobs_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toInternalProductId],
			foreignColumns: [products.internalId],
			name: "migration_jobs_to_internal_product_id_fkey"
		}).onDelete("cascade"),
]);

export const subscriptions = pgTable("subscriptions", {
	id: text().primaryKey().notNull(),
	stripeId: text("stripe_id"),
	stripeScheduleId: text("stripe_schedule_id"),
	createdAt: numeric("created_at"),
	metadata: jsonb().default({}),
	usageFeatures: text("usage_features").array().default([""]),
	orgId: text("org_id"),
	env: text(),
	currentPeriodStart: numeric("current_period_start"),
	currentPeriodEnd: numeric("current_period_end"),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "subscriptions_org_id_fkey"
		}).onDelete("cascade"),
	unique("subscriptions_stripe_id_key").on(table.stripeId),
]);

export const referralCodes = pgTable("referral_codes", {
	code: text().notNull(),
	orgId: text("org_id").notNull(),
	env: text().notNull(),
	internalCustomerId: text("internal_customer_id"),
	internalRewardProgramId: text("internal_reward_program_id"),
	id: text().notNull(),
	createdAt: numeric("created_at"),
}, (table) => [
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "referral_codes_internal_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.internalRewardProgramId],
			foreignColumns: [rewardPrograms.internalId],
			name: "referral_codes_internal_reward_program_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organizations.id],
			name: "referral_codes_org_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.code, table.orgId, table.env], name: "referral_codes_pkey"}),
	unique("referral_codes_id_key").on(table.id),
]);

export const migrationErrors = pgTable("migration_errors", {
	internalCustomerId: text("internal_customer_id").notNull(),
	migrationJobId: text("migration_job_id").notNull(),
	createdAt: numeric("created_at"),
	updatedAt: numeric("updated_at"),
	data: jsonb(),
	message: text(),
	code: text(),
}, (table) => [
	foreignKey({
			columns: [table.internalCustomerId],
			foreignColumns: [customers.internalId],
			name: "migration_customers_internal_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.migrationJobId],
			foreignColumns: [migrationJobs.id],
			name: "migration_customers_migration_job_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.internalCustomerId, table.migrationJobId], name: "migration_errors_pkey"}),
]);
