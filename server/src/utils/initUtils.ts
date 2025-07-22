import { logger } from "@/external/logtail/logtailUtils.js";
import "dotenv/config";

export const checkEnvVars = () => {
  if (!process.env.DATABASE_URL) {
    console.error(`DATABASE_URL is not set`);
    process.exit(1);
  }

  if (!process.env.ENCRYPTION_IV || !process.env.ENCRYPTION_PASSWORD) {
    console.error(
      `ENCRYPTION_IV or ENCRYPTION_PASSWORD is not set (used for Stripe key encryption)`,
    );
    process.exit(1);
  }

  if (!process.env.REDIS_URL) {
    console.error(`REDIS_URL is not set`);
    process.exit(1);
  }

  if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) {
    console.error(`BETTER_AUTH_SECRET or BETTER_AUTH_URL is not set`);
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_DOMAIN) {
    logger.warn(
      "RESEND_API_KEY or RESEND_DOMAIN is not set (use terminal for sign in OTP)",
    );
  }

  if (
    !process.env.LOGTAIL_SOURCE_TOKEN ||
    !process.env.LOGTAIL_INGESTING_HOST
  ) {
    logger.warn("LOGTAIL ENV VARs not found, skipping logtail");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.warn(
      `SUPABASE_URL or SUPABASE_SERVICE_KEY is not set, some actions will be skipped`,
    );
  }

  if (!process.env.CLICKHOUSE_URL || !process.env.CLICKHOUSE_USERNAME || !process.env.CLICKHOUSE_PASSWORD) {
    logger.warn(
      `CLICKHOUSE_URL or CLICKHOUSE_USERNAME or CLICKHOUSE_PASSWORD is not set, some actions will be skipped`,
    );
  }

  if (!process.env.SVIX_API_KEY) {
    logger.warn(`SVIX_API_KEY is not set, some actions will be skipped`);
    return;
  }
};
