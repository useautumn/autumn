import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveMiscMainUrl } from "@/external/redis/initUtils/redisConfig.js";
import "dotenv/config";
import { getAutumnEnv } from "@autumn/env";

export const checkEnvVars = () => {
	getAutumnEnv();

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

	if (!resolveMiscMainUrl()) {
		console.error(
			"Misc Redis cache is not configured (set MISC_CACHE_DRAGONFLY_PUBLIC_URL)",
		);
		process.exit(1);
	}

	if (!process.env.BETTER_AUTH_SECRET) {
		console.error(`BETTER_AUTH_SECRET is not set`);
		process.exit(1);
	}

	if (!process.env.RESEND_API_KEY || !process.env.RESEND_DOMAIN) {
		logger.warn(
			"RESEND_API_KEY or RESEND_DOMAIN is not set (use terminal for sign in OTP)",
		);
	}

	if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
		logger.warn(
			`SUPABASE_URL or SUPABASE_SERVICE_KEY is not set, some actions will be skipped`,
		);
	}

	if (!process.env.SVIX_API_KEY) {
		logger.warn(`SVIX_API_KEY is not set, some actions will be skipped`);
		return;
	}
};
