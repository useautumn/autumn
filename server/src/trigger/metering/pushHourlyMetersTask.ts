import { createAxiomClient } from "@autumn/axiom";
import { createAutumnClient, pushHourlyMeters } from "@autumn/billing";
import { createFxClient } from "@autumn/fx";
import { schedules } from "@trigger.dev/sdk/v3";
import { dbReplicaSlow } from "@/db/initDrizzle.js";
import { createDualLogger } from "@/external/logtail/logtailUtils.js";

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

/** Meters Autumn's own usage for the hour that just closed. Sandbox key only until metering is live. */
export const pushHourlyMetersTask = schedules.task({
	id: "push-hourly-meters",
	cron: "10 * * * *",
	maxDuration: 600,
	retry: { maxAttempts: 1 },
	run: async (payload) => {
		const logger = createDualLogger();
		const axiom = createAxiomClient({
			config: {
				token: requireEnv("AXIOM_ADMIN_TOKEN"),
				orgId: process.env.AXIOM_ORG_ID,
			},
		});
		const autumn = createAutumnClient({
			config: { secretKey: requireEnv("AUTUMN_METERING_SECRET_KEY") },
		});
		const fx = createFxClient({
			config: { appId: requireEnv("OPEN_EXCHANGE_RATES_APP_ID") },
		});
		const db = dbReplicaSlow;
		if (!db) throw new Error("DATABASE_REPLICA_URL is not set");

		return pushHourlyMeters({
			ctx: { logger, axiom, db, fx, autumn },
			nowMs: payload.timestamp.getTime(),
		});
	},
});
