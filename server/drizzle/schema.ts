import {
  pgTable,
  foreignKey,
  unique,
  text,
  numeric,
  jsonb,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const rewards = pgTable(
  "rewards",
  {
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
  },
  (table) => [
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "coupons_org_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const rewardPrograms = pgTable(
  "reward_programs",
  {
    internalId: text("internal_id").primaryKey().notNull(),
    id: text(),
    createdAt: numeric("created_at").notNull(),
    internalRewardId: text("internal_reward_id"),
    maxRedemptions: numeric("max_redemptions"),
    unlimitedRedemptions: boolean("unlimited_redemptions").default(false),
    orgId: text("org_id"),
    env: text(),
    when: text().default("immediately"),
    productIds: text("product_ids").array().default([""]),
    excludeTrial: boolean("exclude_trial").default(false),
    receivedBy: text("received_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.internalRewardId],
      foreignColumns: [rewards.internalId],
      name: "reward_triggers_internal_reward_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "reward_triggers_org_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
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
  },
  (table) => [
    foreignKey({
      columns: [table.customerPriceId],
      foreignColumns: [customerPrices.id],
      name: "invoice_items_customer_price_id_fkey",
    }).onDelete("cascade"),
    unique("invoice_items_id_key").on(table.id),
  ],
);

export const rewardRedemptions = pgTable(
  "reward_redemptions",
  {
    id: text().primaryKey().notNull(),
    createdAt: numeric("created_at").notNull(),
    updatedAt: numeric("updated_at"),
    internalCustomerId: text("internal_customer_id"),
    triggered: boolean(),
    internalRewardProgramId: text("internal_reward_program_id"),
    applied: boolean().default(false),
    referralCodeId: text("referral_code_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.internalCustomerId],
      foreignColumns: [customers.internalId],
      name: "reward_redemptions_internal_customer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.internalRewardProgramId],
      foreignColumns: [rewardPrograms.internalId],
      name: "reward_redemptions_internal_reward_program_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.referralCodeId],
      foreignColumns: [referralCodes.id],
      name: "reward_redemptions_referral_code_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const migrationJobs = pgTable(
  "migration_jobs",
  {
    id: text().primaryKey().notNull(),
    createdAt: numeric("created_at").notNull(),
    updatedAt: numeric("updated_at"),
    currentStep: text("current_step"),
    fromInternalProductId: text("from_internal_product_id"),
    toInternalProductId: text("to_internal_product_id"),
    stepDetails: jsonb("step_details"),
    orgId: text("org_id"),
    env: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.fromInternalProductId],
      foreignColumns: [products.internalId],
      name: "migration_jobs_from_internal_product_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "migration_jobs_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.toInternalProductId],
      foreignColumns: [products.internalId],
      name: "migration_jobs_to_internal_product_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    code: text().notNull(),
    orgId: text("org_id").notNull(),
    env: text().notNull(),
    internalCustomerId: text("internal_customer_id"),
    internalRewardProgramId: text("internal_reward_program_id"),
    id: text().notNull(),
    createdAt: numeric("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.internalCustomerId],
      foreignColumns: [customers.internalId],
      name: "referral_codes_internal_customer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.internalRewardProgramId],
      foreignColumns: [rewardPrograms.internalId],
      name: "referral_codes_internal_reward_program_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "referral_codes_org_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.code, table.orgId, table.env],
      name: "referral_codes_pkey",
    }),
    unique("referral_codes_id_key").on(table.id),
  ],
);

export const migrationErrors = pgTable(
  "migration_errors",
  {
    internalCustomerId: text("internal_customer_id").notNull(),
    migrationJobId: text("migration_job_id").notNull(),
    createdAt: numeric("created_at"),
    updatedAt: numeric("updated_at"),
    data: jsonb(),
    message: text(),
    code: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.internalCustomerId],
      foreignColumns: [customers.internalId],
      name: "migration_customers_internal_customer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.migrationJobId],
      foreignColumns: [migrationJobs.id],
      name: "migration_customers_migration_job_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.internalCustomerId, table.migrationJobId],
      name: "migration_errors_pkey",
    }),
  ],
);
