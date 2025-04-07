import {
  AppEnv,
  MigrationCustomerStatus,
  MigrationJobStep,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export class MigrationService {
  static async createJob({ sb, data }: { sb: SupabaseClient; data: any }) {
    let { data: insertedData, error } = await sb
      .from("migration_jobs")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return insertedData;
  }

  static async updateJob({
    sb,
    migrationJobId,
    updates,
  }: {
    sb: SupabaseClient;
    migrationJobId: string;
    updates: any;
  }) {
    let { data: updatedData, error } = await sb
      .from("migration_jobs")
      .update({
        ...updates,
        updated_at: Date.now(),
      })
      .eq("id", migrationJobId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return updatedData;
  }

  static async getJob({ sb, id }: { sb: SupabaseClient; id: string }) {
    let { data: job, error } = await sb
      .from("migration_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return job;
  }

  static async getExistingJobs({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
  }) {
    let { data: jobs, error } = await sb
      .from("migration_jobs")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env)
      .neq("current_step", MigrationJobStep.Failed)
      .neq("current_step", MigrationJobStep.Finished);

    if (error) {
      throw error;
    }

    return jobs;
  }
  static async insertCustomers({
    sb,
    data,
  }: {
    sb: SupabaseClient;
    data: any;
  }) {
    let { error } = await sb.from("migration_customers").insert(data);

    if (error) {
      throw error;
    }

    return;
  }

  static getBatch = async ({
    sb,
    migrationJobId,
    batchSize = 10,
  }: {
    sb: SupabaseClient;
    migrationJobId: string;
    batchSize?: number;
  }) => {
    let { data: migrationCustomers, error } = await sb
      .from("migration_customers")
      .select("*")
      .eq("migration_job_id", migrationJobId)
      .eq("status", MigrationCustomerStatus.Pending)
      .order("internal_customer_id")
      .limit(batchSize);

    if (error) {
      throw error;
    }

    return migrationCustomers;
  };

  static async insertError({ sb, data }: { sb: SupabaseClient; data: any }) {
    let { error } = await sb.from("migration_errors").insert(data);

    if (error) {
      throw error;
    }

    return;
  }

  static async getErrors({
    sb,
    migrationJobId,
  }: {
    sb: SupabaseClient;
    migrationJobId: string;
  }) {
    let { data: errors, error } = await sb
      .from("migration_errors")
      .select("*, customer:customers(*)")
      .eq("migration_job_id", migrationJobId);

    if (error) {
      throw error;
    }

    return errors;
  }
}
