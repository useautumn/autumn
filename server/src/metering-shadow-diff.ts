import "dotenv/config";

import pLimit from "p-limit";
import { printSummary } from "./internal/metering/loadtest/summary.js";
import {
	classifyBalancePair,
	type DiffClassification,
} from "./internal/metering/shadowDiff/classifyBalancePair.js";

// One-off ECS Fargate task: run after a shadow load test to compare the
// metering worker's folded balances against the live API's balances for the
// same (customer, feature) pairs the load test drove traffic against.
//
// Known benign, high-side drift (worker > API): the shadow tap (see
// internal/metering/shadow/shadowTap.ts) only mirrors committed primary-path
// deductions onto the metering log — PG-fallback tracks and refunds aren't
// mirrored, and grants/attach mutations aren't tapped at all yet. So the
// worker can be missing decrements the API applied, or holding decrements
// the API later reversed. This tool reports the diff, it doesn't judge it.
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 8;
const MAX_REPORTED_MISMATCHES = 50;

const requireEnv = ({ name }: { name: string }): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const parseIdList = ({ raw }: { raw: string }): string[] =>
	raw
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);

const workerUrl = requireEnv({ name: "LT_WORKER_URL" }).replace(/\/+$/, "");
const apiBase = requireEnv({ name: "LT_API_BASE" }).replace(/\/+$/, "");
const apiKey = requireEnv({ name: "LT_API_KEY" });
const customerIds = parseIdList({
	raw: requireEnv({ name: "LT_CUSTOMER_IDS" }),
});
const featureIds = parseIdList({
	raw: requireEnv({ name: "LT_FEATURE_IDS" }),
});
const concurrency = Math.max(
	1,
	Number(process.env.LT_CONCURRENCY ?? DEFAULT_CONCURRENCY),
);

// A failed fetch (network error, timeout, or non-2xx response) marks its
// side "unreachable" for the pair rather than throwing, so one bad customer
// or a blip mid-run doesn't abort the whole comparison.
type BalanceFetch = { ok: true; balance: number | null } | { ok: false };

const fetchWorkerBalance = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}): Promise<BalanceFetch> => {
	const url = `${workerUrl}/check?customer_id=${encodeURIComponent(customerId)}&feature_id=${encodeURIComponent(featureId)}`;

	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!response.ok) return { ok: false };

		const body = (await response.json()) as { balance?: unknown };
		return {
			ok: true,
			balance: typeof body.balance === "number" ? body.balance : null,
		};
	} catch {
		return { ok: false };
	}
};

const fetchApiBalance = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}): Promise<BalanceFetch> => {
	try {
		const response = await fetch(`${apiBase}/v1/check`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({ customer_id: customerId, feature_id: featureId }),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!response.ok) return { ok: false };

		// balance is ApiBalanceV1 | null (CheckResponseV3Schema); `remaining` is
		// the live equivalent of the worker fold's raw balance number.
		const body = (await response.json()) as {
			balance?: { remaining?: unknown } | null;
		};
		const remaining = body.balance?.remaining;
		return {
			ok: true,
			balance: typeof remaining === "number" ? remaining : null,
		};
	} catch {
		return { ok: false };
	}
};

type PairResult =
	| { status: "unreachable"; customerId: string; featureId: string }
	| ({
			status: "classified";
			customerId: string;
			featureId: string;
	  } & DiffClassification);

const comparePair = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}): Promise<PairResult> => {
	const [workerResult, apiResult] = await Promise.all([
		fetchWorkerBalance({ customerId, featureId }),
		fetchApiBalance({ customerId, featureId }),
	]);

	if (!workerResult.ok || !apiResult.ok) {
		return { status: "unreachable", customerId, featureId };
	}

	return {
		status: "classified",
		customerId,
		featureId,
		...classifyBalancePair({
			apiBalance: apiResult.balance,
			workerBalance: workerResult.balance,
		}),
	};
};

const limit = pLimit(concurrency);
const pairs = customerIds.flatMap((customerId) =>
	featureIds.map((featureId) => ({ customerId, featureId })),
);

const results = await Promise.all(
	pairs.map((pair) => limit(() => comparePair(pair))),
);

let match = 0;
let mismatch = 0;
let workerMissing = 0;
let apiMissing = 0;
let unreachable = 0;
const mismatches: {
	customer: string;
	feature: string;
	api: number;
	worker: number;
	delta: number;
}[] = [];

for (const result of results) {
	if (result.status === "unreachable") {
		unreachable++;
		continue;
	}

	switch (result.kind) {
		case "match":
			match++;
			break;
		case "mismatch":
			mismatch++;
			if (mismatches.length < MAX_REPORTED_MISMATCHES) {
				mismatches.push({
					customer: result.customerId,
					feature: result.featureId,
					api: result.api,
					worker: result.worker,
					delta: result.delta,
				});
			}
			break;
		case "worker_missing":
			workerMissing++;
			break;
		case "api_missing":
			apiMissing++;
			break;
	}
}

printSummary({
	summary: {
		pairs: pairs.length,
		match,
		mismatch,
		worker_missing: workerMissing,
		api_missing: apiMissing,
		unreachable,
		mismatches,
	},
});
