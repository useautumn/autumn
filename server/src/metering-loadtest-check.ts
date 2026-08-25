import "dotenv/config";

import { computeLatencyStats } from "./internal/metering/loadtest/percentiles.js";
import { printSummary } from "./internal/metering/loadtest/summary.js";
import { startFixedTickLoop } from "./internal/metering/loadtest/tickScheduler.js";

// One-off ECS Fargate task: hammers a running metering-worker's /check
// endpoint to load-test the HTTP read path. Customer ids share the `lt_cus_`
// prefix the producer uses, so this can point at either synthetic or live
// traffic depending on LT_TARGET_URL.
const TICK_INTERVAL_MS = 50;
const LOADTEST_FEATURE_ID = "lt_feature_0";
const NETWORK_ERROR_STATUS_KEY = "error";

const requireEnv = ({ name }: { name: string }): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const targetUrl = requireEnv({ name: "LT_TARGET_URL" }).replace(/\/+$/, "");

const rate = Number(process.env.LT_RATE ?? 200);
const durationS = Number(process.env.LT_DURATION_S ?? 180);
const customerCount = Number(process.env.LT_CUSTOMERS ?? 15000);

let sent = 0;
const statusCounts: Record<string, number> = {};
const latencyMsSamples: number[] = [];

const recordStatus = ({ key }: { key: string }): void => {
	statusCounts[key] = (statusCounts[key] ?? 0) + 1;
};

const sendOne = async (): Promise<void> => {
	const customerId = `lt_cus_${Math.floor(Math.random() * customerCount)}`;
	const url = `${targetUrl}/check?customer_id=${encodeURIComponent(customerId)}&feature_id=${LOADTEST_FEATURE_ID}`;
	const startedAt = performance.now();
	sent++;

	try {
		const response = await fetch(url);
		latencyMsSamples.push(performance.now() - startedAt);
		recordStatus({ key: String(response.status) });
	} catch {
		latencyMsSamples.push(performance.now() - startedAt);
		recordStatus({ key: NETWORK_ERROR_STATUS_KEY });
	}
};

const sendBatch = async ({
	batchSize,
}: {
	batchSize: number;
}): Promise<void> => {
	await Promise.all(Array.from({ length: batchSize }, sendOne));
};

const startedAt = Date.now();
const controller = startFixedTickLoop({
	ratePerSec: rate,
	tickIntervalMs: TICK_INTERVAL_MS,
	durationS,
	onTick: sendBatch,
});

let summarized = false;
const summarizeAndExit = (): void => {
	if (summarized) return;
	summarized = true;

	const elapsedS = (Date.now() - startedAt) / 1000;

	printSummary({
		summary: {
			sent,
			achievedRate: elapsedS > 0 ? sent / elapsedS : 0,
			statusCounts,
			latencyMs: computeLatencyStats({ samplesMs: latencyMsSamples }),
		},
	});

	process.exit(0);
};

process.on("SIGTERM", () => {
	controller.stop();
});
process.on("SIGINT", () => {
	controller.stop();
});

await controller.done;
summarizeAndExit();
