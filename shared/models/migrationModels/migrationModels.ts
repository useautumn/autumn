import z from "zod";
import { AppEnv } from "../genModels.js";
import { ErrCode } from "../../errors/errCode.js";

export enum MigrationJobStep {
  // Pending = "pending",
  Queued = "queued",
  // InsertCustomers = "insert_customers",
  GetCustomers = "get_customers",
  MigrateCustomers = "migrate_customers",
  Finished = "finished",
  Failed = "failed",
}

export const MigrationJobSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  current_step: z.nativeEnum(MigrationJobStep),

  from_internal_product_id: z.string(),
  to_internal_product_id: z.string(),

  // from_csv_id: z.string().nullish(),
  step_details: z.record(z.string(), z.any()),

  // Other details
  org_id: z.string(),
  env: z.nativeEnum(AppEnv),
});

export type MigrationJob = z.infer<typeof MigrationJobSchema>;

// MIGRATION CUSTOMER
export enum MigrationCustomerStatus {
  Pending = "pending",
  Finished = "finished",
  Failed = "failed",
}

export const MigrationErrorSchema = z.object({
  migration_job_id: z.string(),
  internal_customer_id: z.string(),

  created_at: z.number(),
  updated_at: z.number(),

  data: z.any(),
  code: z.string(),
  message: z.string(),
});

export type MigrationError = z.infer<typeof MigrationErrorSchema>;
