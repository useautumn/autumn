import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getTwStripeRedis } from "./getTwStripeRedis";
import admissionScript from "./stripeAdmission.lua" with { type: "text" };
import { getTwStripeLane } from "./twStripeRequestContext";
import type { TwStripeBudget } from "./types/twStripeAdmission";

const getBudget = (): TwStripeBudget => {
	const maxRps = Number(process.env.TW_STRIPE_MAX_RPS);
	const maxInFlight = Number(process.env.TW_STRIPE_MAX_INFLIGHT);
	if (
		!Number.isFinite(maxRps) ||
		maxRps <= 0 ||
		!Number.isInteger(maxInFlight) ||
		maxInFlight < 2
	) {
		throw new Error(
			"Invalid shared Stripe budget: positive RPS and at least two in-flight slots required",
		);
	}
	return { maxRps, maxInFlight };
};

export const acquireTwStripePermit = async ({
	authorization,
	timeoutMs,
}: {
	authorization: string;
	timeoutMs: number;
}) => {
	const redis = getTwStripeRedis();
	const { maxRps, maxInFlight } = getBudget();
	const fingerprint = createHash("sha256").update(authorization).digest("hex");
	const prefix = `tw:stripe:{${fingerprint}}`;
	const keys = [
		"state",
		"bulk",
		"webhook",
		"waiting",
		"active",
		"activeBulk",
	].map((suffix) => `${prefix}:${suffix}`);
	const id = randomUUID();
	const lane = getTwStripeLane();
	const leaseMs = Math.max(timeoutMs, 1000) + 5000;
	const args = [id, lane, 1000 / maxRps, maxInFlight, leaseMs];
	const startedAt = performance.now();
	let released = false;
	const release = async () => {
		if (released) return;
		released = true;
		await redis.eval(admissionScript, keys.length, ...keys, "release", ...args);
	};

	try {
		for (;;) {
			const result = (await redis.eval(
				admissionScript,
				keys.length,
				...keys,
				"acquire",
				...args,
			)) as [number, number];
			if (result[0] === 1)
				return {
					release,
					lane,
					waitMs: Math.round(performance.now() - startedAt),
				};
			await delay(result[1]);
		}
	} catch (error) {
		await release().catch(() => {});
		throw error;
	}
};
