/** check's latency SLO leaves no room for a slow worker: past this we take the
 *  Redis path rather than make the caller wait for both. */
export const METERING_WORKER_CHECK_TIMEOUT_MS = 150;
/** track already awaits a broker ack on the worker side, so it gets more room
 *  than check — still far under the route's own fail-open budget. */
export const METERING_WORKER_TRACK_TIMEOUT_MS = 500;

export type MeteringWorkerCheckResult = {
	balance: number;
	allowed: boolean;
};

export type MeteringWorkerTrackResult = {
	balance: number;
	allowed: boolean;
	duplicate?: boolean;
};

export type MeteringWorkerTrackBody = {
	org_id: string;
	env: string;
	customer_id: string;
	feature_id: string;
	value: number;
	idempotency_key: string;
};

/** Every failure mode — network, timeout, non-2xx, unparseable body — collapses
 *  to `null` so the caller has exactly one branch to fall back on. */
export type MeteringWorkerFetch = typeof fetch;

const asNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

export const fetchMeteringWorkerCheck = async ({
	workerUrl,
	customerId,
	featureId,
	timeoutMs = METERING_WORKER_CHECK_TIMEOUT_MS,
	fetchImpl = fetch,
}: {
	workerUrl: string;
	customerId: string;
	featureId: string;
	timeoutMs?: number;
	fetchImpl?: MeteringWorkerFetch;
}): Promise<MeteringWorkerCheckResult | null> => {
	const url = `${workerUrl}/check?customer_id=${encodeURIComponent(
		customerId,
	)}&feature_id=${encodeURIComponent(featureId)}`;

	try {
		const response = await fetchImpl(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) return null;

		const body = (await response.json()) as Record<string, unknown>;
		const balance = asNumber(body.balance);
		if (balance === null || typeof body.allowed !== "boolean") return null;

		return { balance, allowed: body.allowed };
	} catch {
		return null;
	}
};

export const postMeteringWorkerTrack = async ({
	workerUrl,
	body,
	timeoutMs = METERING_WORKER_TRACK_TIMEOUT_MS,
	fetchImpl = fetch,
}: {
	workerUrl: string;
	body: MeteringWorkerTrackBody;
	timeoutMs?: number;
	fetchImpl?: MeteringWorkerFetch;
}): Promise<MeteringWorkerTrackResult | null> => {
	try {
		const response = await fetchImpl(`${workerUrl}/track`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) return null;

		const parsed = (await response.json()) as Record<string, unknown>;
		const balance = asNumber(parsed.balance);
		if (balance === null || typeof parsed.allowed !== "boolean") return null;

		return {
			balance,
			allowed: parsed.allowed,
			...(parsed.duplicate === true ? { duplicate: true } : {}),
		};
	} catch {
		return null;
	}
};
