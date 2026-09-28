/**
 * Run the hourly meters by hand.
 *
 *   bun scripts/pushHourlyMeters.ts --hour 2026-09-27T11            dry run: prints what would be sent
 *   bun scripts/pushHourlyMeters.ts --hour 2026-09-27T11 --push     sends it
 *
 * Reads AXIOM_ADMIN_TOKEN / AXIOM_ORG_ID (prod log, read-only),
 * DATABASE_REPLICA_URL (paid invoices, read-only), OPEN_EXCHANGE_RATES_APP_ID,
 * and AUTUMN_METERING_SECRET_KEY (must be a sandbox key; live keys are refused).
 */

import { createAxiomClient } from "@autumn/axiom";
import { createFxClient } from "@autumn/fx";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { pushHourlyMeters } from "../src/actions/pushHourlyMeters/pushHourlyMeters";
import type { TrackItem } from "../src/actions/pushHourlyMeters/types/trackItem";
import { createAutumnClient } from "../src/external/autumn/createAutumnClient";
import type { AutumnClient } from "../src/types/autumnClient";
import type { HourWindow } from "../src/types/hourWindow";

const argValue = (flag: string): string | undefined => {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
};
const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

const hourArg = argValue("--hour");
if (!hourArg) throw new Error("--hour YYYY-MM-DDTHH (UTC) is required");
const startMs = Date.parse(`${hourArg}:00:00Z`);
if (Number.isNaN(startMs)) throw new Error(`Bad --hour: ${hourArg}`);
const windows: HourWindow[] = [{ startMs, endMs: startMs + 60 * 60 * 1000 }];
const push = process.argv.includes("--push");

const logger = {
	info: (...args: unknown[]) => console.log(...args),
	warn: (...args: unknown[]) => console.warn(...args),
	error: (...args: unknown[]) => console.error(...args),
};
const axiom = createAxiomClient({
	config: {
		token: requireEnv("AXIOM_ADMIN_TOKEN"),
		orgId: process.env.AXIOM_ORG_ID,
	},
});
const replica = new SQL(requireEnv("DATABASE_REPLICA_URL"), { max: 1 });
const db = drizzle({ client: replica });
const fx = createFxClient({
	config: { appId: requireEnv("OPEN_EXCHANGE_RATES_APP_ID") },
});

/** Prints instead of sending; same shape as the real client so the run is otherwise identical. */
const recordingAutumn = (): AutumnClient => ({
	batchTrack: async ({ items }: { items: TrackItem[] }) => {
		console.log(`\n[dry run] batch_track ${items.length} items:`);
		for (const item of items) {
			const detail =
				item.featureId === "usd_volume"
					? `${item.properties.amount} ${item.properties.currency} @ ${item.properties.rate}`
					: item.properties.endpoint_id;
			console.log(
				`  ${item.customerId}\t${item.featureId}\t${detail}\t${item.value}\t${item.idempotencyKey}`,
			);
		}
		return { accepted: items.length };
	},
	getOrCreateCustomer: async ({ id, name }) => {
		console.log(`[dry run] get_or_create ${id} (${name})`);
	},
});

const autumn = push
	? createAutumnClient({
			config: { secretKey: requireEnv("AUTUMN_METERING_SECRET_KEY") },
		})
	: recordingAutumn();

console.log(
	`${push ? "PUSH" : "DRY RUN"} hour ${new Date(startMs).toISOString()}`,
);
try {
	const report = await pushHourlyMeters({
		ctx: { logger, axiom, db, fx, autumn },
		nowMs: Date.now(),
		windows,
	});
	console.log(JSON.stringify(report, null, 2));
} finally {
	await replica.close();
}
