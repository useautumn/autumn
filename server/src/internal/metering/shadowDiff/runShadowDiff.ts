import pLimit from "p-limit";
import { z } from "zod/v4";
import { classifyBalancePair } from "./classifyBalancePair.js";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const MAX_REPORTED_DETAILS = 50;
const MAX_ERROR_BODY_LENGTH = 1_000;

const shadowDiffPairSchema = z.object({
	org_id: z.string().min(1),
	env: z.string().min(1),
	customer_id: z.string().min(1),
	feature_id: z.string().min(1),
});

const shadowDiffPairsSchema = z.array(shadowDiffPairSchema).min(1);

export type ShadowDiffPair = z.infer<typeof shadowDiffPairSchema>;

export type ShadowDiffFailure = {
	status: number | null;
	error: string;
};

export type ShadowDiffSummary = {
	pairs: number;
	match: number;
	mismatch: number;
	worker_missing: number;
	api_missing: number;
	unreachable: number;
	mismatches: Array<{
		customer: string;
		feature: string;
		api: number;
		worker: number;
		delta: number;
	}>;
	unreachable_details: Array<{
		org: string;
		env: string;
		customer: string;
		feature: string;
		worker?: ShadowDiffFailure;
		api?: ShadowDiffFailure;
	}>;
};

type BalanceFetch =
	| { ok: true; balance: number | null }
	| ({ ok: false } & ShadowDiffFailure);

export const parseShadowDiffPairs = ({
	raw,
}: {
	raw: string;
}): ShadowDiffPair[] => shadowDiffPairsSchema.parse(JSON.parse(raw));

const errorMessageFromResponse = async ({
	response,
}: {
	response: Response;
}): Promise<string> => {
	const text = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH).trim();
	if (!text) return `HTTP ${response.status}`;

	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		for (const key of ["error", "message"]) {
			if (typeof parsed[key] === "string" && parsed[key]) return parsed[key];
		}
	} catch {
		// The bounded response text below is more useful than a JSON parse error.
	}

	return text;
};

export const waitForWorkerCatchUp = async ({
	workerUrl,
	timeoutMs = 2 * 60_000,
	pollIntervalMs = 250,
	fetchImpl = fetch,
	sleep = (milliseconds) =>
		new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}: {
	workerUrl: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
	fetchImpl?: typeof fetch;
	sleep?: (milliseconds: number) => Promise<void>;
}): Promise<void> => {
	const base = workerUrl.replace(/\/+$/, "");
	const deadline = Date.now() + timeoutMs;
	let barrier: Response;
	try {
		barrier = await fetchImpl(`${base}/catch-up`, {
			method: "POST",
			signal: AbortSignal.timeout(
				Math.min(timeoutMs, DEFAULT_FETCH_TIMEOUT_MS),
			),
		});
	} catch (error) {
		throw new Error(
			`Worker catch-up barrier failed: ${error instanceof Error ? error.message : "request failed"}`,
			{ cause: error },
		);
	}
	if (barrier.status !== 200 && barrier.status !== 202) {
		throw new Error(
			`Worker catch-up barrier failed (${barrier.status}): ${await errorMessageFromResponse({ response: barrier })}`,
		);
	}

	while (Date.now() <= deadline) {
		let health: Response;
		try {
			health = await fetchImpl(`${base}/healthz`, {
				signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
			});
		} catch (error) {
			throw new Error(
				`Worker catch-up health check failed: ${error instanceof Error ? error.message : "request failed"}`,
				{ cause: error },
			);
		}
		if (health.ok) return;
		if (health.status !== 503) {
			throw new Error(
				`Worker catch-up health check failed (${health.status}): ${await errorMessageFromResponse({ response: health })}`,
			);
		}
		await sleep(pollIntervalMs);
	}

	throw new Error(`Worker did not catch up within ${timeoutMs}ms`);
};

const fetchBalance = async ({
	url,
	init,
	readBalance,
	timeoutMs,
	fetchImpl,
}: {
	url: string;
	init?: RequestInit;
	readBalance: (body: unknown) => number | null;
	timeoutMs: number;
	fetchImpl: typeof fetch;
}): Promise<BalanceFetch> => {
	let response: Response;
	try {
		response = await fetchImpl(url, {
			...init,
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (error) {
		return {
			ok: false,
			status: null,
			error: error instanceof Error ? error.message : "request failed",
		};
	}

	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
			error: await errorMessageFromResponse({ response }),
		};
	}

	try {
		return { ok: true, balance: readBalance(await response.json()) };
	} catch (error) {
		return {
			ok: false,
			status: response.status,
			error:
				error instanceof Error ? error.message : "invalid balance response",
		};
	}
};

const readWorkerBalance = (body: unknown): number | null => {
	if (body === null || typeof body !== "object") {
		throw new Error("worker response has no numeric balance");
	}
	const balance = (body as { balance?: unknown }).balance;
	if (typeof balance !== "number" || !Number.isFinite(balance)) {
		throw new Error("worker response has no numeric balance");
	}
	return balance;
};

const readApiBalance = (body: unknown): number | null => {
	if (body === null || typeof body !== "object") return null;
	const balance = (body as { balance?: unknown }).balance;
	if (balance === null || typeof balance !== "object") return null;
	const remaining = (balance as { remaining?: unknown }).remaining;
	return typeof remaining === "number" && Number.isFinite(remaining)
		? remaining
		: null;
};

export const runShadowDiff = async ({
	pairs,
	workerUrl,
	apiBase,
	apiKey,
	concurrency = DEFAULT_CONCURRENCY,
	timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
	fetchImpl = fetch,
}: {
	pairs: ShadowDiffPair[];
	workerUrl: string;
	apiBase: string;
	apiKey: string;
	concurrency?: number;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}): Promise<ShadowDiffSummary> => {
	const workerBase = workerUrl.replace(/\/+$/, "");
	const apiBaseUrl = apiBase.replace(/\/+$/, "");
	const limit = pLimit(Math.max(1, concurrency));

	const results = await Promise.all(
		pairs.map((pair) =>
			limit(async () => {
				const workerCheckUrl = new URL(`${workerBase}/check`);
				workerCheckUrl.searchParams.set("org_id", pair.org_id);
				workerCheckUrl.searchParams.set("env", pair.env);
				workerCheckUrl.searchParams.set("customer_id", pair.customer_id);
				workerCheckUrl.searchParams.set("feature_id", pair.feature_id);

				const [worker, api] = await Promise.all([
					fetchBalance({
						url: workerCheckUrl.toString(),
						readBalance: readWorkerBalance,
						timeoutMs,
						fetchImpl,
					}),
					fetchBalance({
						url: `${apiBaseUrl}/v1/check`,
						init: {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${apiKey}`,
							},
							body: JSON.stringify({
								customer_id: pair.customer_id,
								feature_id: pair.feature_id,
							}),
						},
						readBalance: readApiBalance,
						timeoutMs,
						fetchImpl,
					}),
				]);

				return { pair, worker, api };
			}),
		),
	);

	const summary: ShadowDiffSummary = {
		pairs: pairs.length,
		match: 0,
		mismatch: 0,
		worker_missing: 0,
		api_missing: 0,
		unreachable: 0,
		mismatches: [],
		unreachable_details: [],
	};

	for (const { pair, worker, api } of results) {
		if (!worker.ok || !api.ok) {
			summary.unreachable++;
			if (summary.unreachable_details.length < MAX_REPORTED_DETAILS) {
				summary.unreachable_details.push({
					org: pair.org_id,
					env: pair.env,
					customer: pair.customer_id,
					feature: pair.feature_id,
					...(!worker.ok
						? { worker: { status: worker.status, error: worker.error } }
						: {}),
					...(!api.ok ? { api: { status: api.status, error: api.error } } : {}),
				});
			}
			continue;
		}

		const classification = classifyBalancePair({
			apiBalance: api.balance,
			workerBalance: worker.balance,
		});
		switch (classification.kind) {
			case "match":
				summary.match++;
				break;
			case "mismatch":
				summary.mismatch++;
				if (summary.mismatches.length < MAX_REPORTED_DETAILS) {
					summary.mismatches.push({
						customer: pair.customer_id,
						feature: pair.feature_id,
						api: classification.api,
						worker: classification.worker,
						delta: classification.delta,
					});
				}
				break;
			case "worker_missing":
				summary.worker_missing++;
				break;
			case "api_missing":
				summary.api_missing++;
				break;
		}
	}

	return summary;
};
