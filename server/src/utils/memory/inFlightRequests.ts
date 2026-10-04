export type InFlightRequestSummary = {
	method: string;
	path: string;
	elapsedMs: number;
	orgSlug?: string;
	customerId?: string;
};

type InFlightRequest = {
	startedAt: number;
	method: string;
	path: string;
	resolveIdentity: () => { orgSlug?: string; customerId?: string };
};

const inFlightRequests = new Set<InFlightRequest>();
let finishedRequestCount = 0;

/** Returns a release function; callers must invoke it in a `finally`. */
export const registerInFlightRequest = ({
	startedAt,
	method,
	path,
	resolveIdentity,
}: InFlightRequest): (() => void) => {
	const request: InFlightRequest = {
		startedAt,
		method,
		path,
		resolveIdentity,
	};
	inFlightRequests.add(request);

	return () => {
		inFlightRequests.delete(request);
		finishedRequestCount++;
	};
};

/** Requests finished since the last drain, for the per-window server.event_loop line. */
export const drainFinishedRequestCount = () => {
	const count = finishedRequestCount;
	finishedRequestCount = 0;
	return count;
};

export const listInFlightRequests = ({
	now,
}: {
	now: number;
}): InFlightRequestSummary[] => {
	const summaries: InFlightRequestSummary[] = [];

	for (const request of inFlightRequests) {
		let identity: { orgSlug?: string; customerId?: string } = {};
		try {
			identity = request.resolveIdentity();
		} catch {
			// A half-built request context must not break the probe.
		}

		summaries.push({
			method: request.method,
			path: request.path,
			elapsedMs: now - request.startedAt,
			orgSlug: identity.orgSlug,
			customerId: identity.customerId,
		});
	}

	return summaries;
};

export const clearInFlightRequests = () => {
	inFlightRequests.clear();
};
