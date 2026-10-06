import { randomUUID } from "node:crypto";
import { getTwStripeRedis } from "./getTwStripeRedis";
import statsScript from "./twStripeFileStats.lua" with { type: "text" };
import { getTwStripeFileTag } from "./twStripeRequestContext";

/** Upper bounds (ms) of the permit-wait histogram; keep in sync with runTestFileWithStats.ts. */
export const TW_PERMIT_WAIT_BUCKETS_MS = [
	1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

const toWaitBucket = (waitMs: number) =>
	String(TW_PERMIT_WAIT_BUCKETS_MS.find((bound) => waitMs < bound) ?? "inf");

/** Stripe's header values are short kebab-case words; anything else is bucketed. */
const toReason = (reason: unknown) =>
	typeof reason === "string" && /^[a-z0-9_-]{1,40}$/.test(reason)
		? reason
		: "unknown";

const twFileStatsKeys = (fileTag: string | undefined) => {
	const file = `tw:fs:file:${fileTag ?? "-"}`;
	return [file, `${file}:inflight`, "tw:fs:machine", "tw:fs:machine:inflight"];
};

/** Counts one admitted Stripe request against its test file; never throws into the request path. */
export const startTwStripeFileStats = async ({
	waitMs,
	leaseMs,
}: {
	waitMs: number;
	leaseMs: number;
}) => {
	const fileTag = getTwStripeFileTag();
	const keys = twFileStatsKeys(fileTag);
	const id = randomUUID();
	const base = [
		id,
		fileTag ? "1" : "0",
		process.env.TW_TEST_FILE ? "test" : "server",
	];
	const redis = getTwStripeRedis();
	const admittedAt = performance.now();
	await redis
		.eval(
			statsScript,
			keys.length,
			...keys,
			"acquire",
			...base,
			Math.max(0, Math.round(waitMs)),
			leaseMs,
			toWaitBucket(waitMs),
			"0",
			"",
		)
		.catch(() => undefined);

	return {
		finish: async ({
			status,
			rateLimitedReason,
		}: {
			status: number | undefined;
			rateLimitedReason?: unknown;
		}) => {
			await redis
				.eval(
					statsScript,
					keys.length,
					...keys,
					"release",
					...base,
					Math.round(performance.now() - admittedAt),
					leaseMs,
					"",
					status === 429 ? "1" : "0",
					toReason(rateLimitedReason),
				)
				.catch(() => undefined);
		},
	};
};
