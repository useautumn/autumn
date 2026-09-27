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

/** Meters Autumn's own usage for the hour that just closed, into the live org.
 * Retries re-send the same hour; idempotency keys make that safe. */
export const pushHourlyMetersTask = schedules.task({
	id: "push-hourly-meters",
	cron: "10 * * * *",
	maxDuration: 600,
	retry: { maxAttempts: 3 },
	run: async (payload) => {
		const logger = createDualLogger();
		const axiom = createAxiomClient({
			config: {
				token: requireEnv("AXIOM_ADMIN_TOKEN"),
				orgId: process.env.AXIOM_ORG_ID,
			},
		});
		const autumn = createAutumnClient({
			config: {
				secretKey: requireEnv("AUTUMN_SECRET_KEY"),
				allowLiveKey: true,
			},
		});
		const fx = createFxClient({
			config: { appId: requireEnv("OPEN_EXCHANGE_RATES_APP_ID") },
		});
		const db = dbReplicaSlow;
		if (!db) throw new Error("DATABASE_REPLICA_URL is not set");

		const report = await pushHourlyMeters({
			ctx: { logger, axiom, db, fx, autumn },
			nowMs: new Date(payload?.timestamp ?? Date.now()).getTime(),
		});
		const failed = report.apiCalls.failed + report.paymentVolume.failed;
		if (failed > 0) throw new Error(`${failed} track items failed to push`);
		return report;
	},
});
