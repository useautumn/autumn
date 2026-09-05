import { expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createBalanceWorkerClient,
	type PartitionOwner,
} from "../src/balanceWorkerClient.js";
import type {
	HttpRequest,
	HttpResponse,
} from "../src/http/types/httpClient.js";

const command: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	commandId: "command",
	requestId: "request",
	identity: { orgId: "org", env: "sandbox", customerId: "customer" },
	entityId: null,
	featureId: "feature",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	occurredAt: 0,
};
const decision = { kind: "unsupported", reason: "feature_not_found" } as const;
const success = { status: 200, body: { decision } };
const stale = {
	status: 409,
	body: { error: { code: "NOT_OWNER", message: "Stale route" } },
};
const initialOwner = {
	partition: 0,
	routeEpoch: "1",
	endpoint: "http://worker-a:8080",
};
const replacement = {
	partition: 0,
	routeEpoch: "2",
	endpoint: "http://worker-b:8080",
};

function createFixture({
	responses = [success],
	owner = initialOwner,
	nextOwner = replacement,
	timeoutMs = 1000,
	refreshGate,
	refreshFailure,
	transportFailure,
}: {
	responses?: HttpResponse[];
	owner?: PartitionOwner | null;
	nextOwner?: PartitionOwner | null;
	timeoutMs?: number;
	refreshGate?: Promise<void>;
	refreshFailure?: Error;
	transportFailure?: Error;
} = {}) {
	let currentOwner = owner;
	let refreshes = 0;
	const requests: Array<{ url: string; body: unknown }> = [];
	const refreshed = Promise.withResolvers<void>();
	function findOwner(): PartitionOwner | undefined {
		return currentOwner ?? undefined;
	}
	async function refresh(): Promise<void> {
		refreshes++;
		refreshed.resolve();
		await refreshGate;
		if (refreshFailure) throw refreshFailure;
		currentOwner = nextOwner;
	}
	async function postJson(request: HttpRequest): Promise<HttpResponse> {
		requests.push({ url: request.url, body: structuredClone(request.body) });
		if (transportFailure) throw transportFailure;
		return responses[requests.length - 1] ?? success;
	}
	function stats() {
		return { requests, refreshes };
	}
	const client = createBalanceWorkerClient({
		ctx: { owners: { findOwner, refresh }, http: { postJson } },
		config: { partitionCount: 1, timeoutMs },
	});
	return { client, stats, refreshed: refreshed.promise };
}

async function usesCachedOwner(): Promise<void> {
	const fixture = createFixture();
	expect(await fixture.client.track({ command })).toBe(decision);
	expect(fixture.stats()).toEqual({
		refreshes: 0,
		requests: [
			{
				url: "http://worker-a:8080/v1/track",
				body: { route: { partition: 0, routeEpoch: "1" }, command },
			},
		],
	});
}

async function reroutesOnce(): Promise<void> {
	const fixture = createFixture({ responses: [stale, success] });
	expect(await fixture.client.track({ command })).toEqual(decision);
	expect(fixture.stats().refreshes).toBe(1);
	expect(fixture.stats().requests[1]).toEqual({
		url: "http://worker-b:8080/v1/track",
		body: { route: { partition: 0, routeEpoch: "2" }, command },
	});
	const stillStale = createFixture({ responses: [stale, stale] });
	await expect(stillStale.client.track({ command })).rejects.toMatchObject({
		code: "ROUTE_STILL_STALE",
		outcome: "not_submitted",
	});
	expect(stillStale.stats().requests).toHaveLength(2);
	expect(stillStale.stats().refreshes).toBe(1);
}

async function refreshesMissingOwner(): Promise<void> {
	const fixture = createFixture({ owner: null });
	await fixture.client.track({ command });
	expect(fixture.stats().refreshes).toBe(1);
	expect(fixture.stats().requests).toHaveLength(1);
	const missing = createFixture({ owner: null, nextOwner: null });
	await expect(missing.client.track({ command })).rejects.toMatchObject({
		code: "NO_OWNER",
		outcome: "not_submitted",
	});
	expect(missing.stats().requests).toHaveLength(0);
	const staleAfterMiss = createFixture({ owner: null, responses: [stale] });
	await expect(staleAfterMiss.client.track({ command })).rejects.toMatchObject({
		code: "ROUTE_STILL_STALE",
	});
	expect(staleAfterMiss.stats().refreshes).toBe(1);
	expect(staleAfterMiss.stats().requests).toHaveLength(1);
}

async function preservesCommandAcrossRetry(): Promise<void> {
	const gate = Promise.withResolvers<void>();
	const fixture = createFixture({
		responses: [stale, success],
		refreshGate: gate.promise,
	});
	const input = structuredClone(command);
	const pending = fixture.client.track({ command: input });
	await fixture.refreshed;
	input.value = 999;
	input.identity.customerId = "other";
	gate.resolve();
	await pending;
	for (const request of fixture.stats().requests)
		expect(request.body).toMatchObject({ command });
}

async function doesNotRetryWorkerErrors(): Promise<void> {
	for (const [status, code] of [
		[400, "INVALID_REQUEST"],
		[503, "NOT_READY"],
		[500, "INTERNAL"],
	] as const) {
		const fixture = createFixture({
			responses: [{ status, body: { error: { code, message: "Rejected" } } }],
		});
		await expect(fixture.client.track({ command })).rejects.toMatchObject({
			code: "WORKER_ERROR",
			workerCode: code,
			outcome: code === "INTERNAL" ? "unknown" : "not_submitted",
		});
		expect(fixture.stats()).toMatchObject({ refreshes: 0 });
		expect(fixture.stats().requests).toHaveLength(1);
	}
}

async function rejectsUnknownHttpErrors(): Promise<void> {
	for (const response of [
		{
			status: 409,
			body: { error: { code: "NOT_READY", message: "Wrong status" } },
		},
		{
			status: 409,
			body: { error: { code: "invented", message: "Invalid code" } },
		},
		{ status: 502, body: { error: "upstream" } },
		{ status: 409, body: null },
		{ status: 409, body: {} },
		{
			status: 500,
			body: { error: { code: "NOT_OWNER", message: "Wrong status" } },
		},
	]) {
		const fixture = createFixture({ responses: [response] });
		await expect(fixture.client.track({ command })).rejects.toMatchObject({
			code: "INVALID_RESPONSE",
			outcome: "unknown",
		});
		expect(fixture.stats().refreshes).toBe(0);
		expect(fixture.stats().requests).toHaveLength(1);
	}
}

async function preservesUncertainTransportFailure(): Promise<void> {
	const fixture = createFixture({
		transportFailure: new Error("socket reset"),
	});
	await expect(fixture.client.track({ command })).rejects.toMatchObject({
		code: "TRANSPORT",
		outcome: "unknown",
	});
	expect(fixture.stats().requests).toHaveLength(1);
	expect(fixture.stats().refreshes).toBe(0);
}

async function boundsOwnershipWait(): Promise<void> {
	const gate = Promise.withResolvers<void>();
	const fixture = createFixture({
		owner: null,
		refreshGate: gate.promise,
		timeoutMs: 10,
	});
	await expect(fixture.client.track({ command })).rejects.toMatchObject({
		code: "DEADLINE",
		outcome: "not_submitted",
	});
	expect(fixture.stats().requests).toHaveLength(0);
	gate.resolve();
}

async function preservesOwnershipFailures(): Promise<void> {
	const fixture = createFixture({
		owner: null,
		refreshFailure: new Error("broker down"),
	});
	await expect(fixture.client.track({ command })).rejects.toMatchObject({
		code: "OWNERSHIP_UNAVAILABLE",
		outcome: "not_submitted",
	});
	expect(fixture.stats().requests).toHaveLength(0);
}

async function respectsCallerCancellation(): Promise<void> {
	const fixture = createFixture();
	await expect(
		fixture.client.track({ command, signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "ABORTED", outcome: "not_submitted" });
	expect(fixture.stats().requests).toHaveLength(0);
}

test("uses cached ownership without a Kafka read", usesCachedOwner);
test("reroutes once and bounds repeated stale routes", reroutesOnce);
test(
	"refreshes empty maps without exceeding one refresh",
	refreshesMissingOwner,
);
test(
	"snapshots the command before asynchronous routing",
	preservesCommandAcrossRetry,
);
test(
	"does not retry worker errors, including ambiguous INTERNAL",
	doesNotRetryWorkerErrors,
);
test(
	"does not interpret proxy or status-mismatched errors as stale ownership",
	rejectsUnknownHttpErrors,
);
test(
	"never retries ambiguous transport failures",
	preservesUncertainTransportFailure,
);
test("the operation deadline includes ownership refresh", boundsOwnershipWait);
test(
	"reports ownership refresh failures before sending",
	preservesOwnershipFailures,
);
test("a canceled request never sends", respectsCallerCancellation);

async function preservesBodyTimeoutAmbiguity(): Promise<void> {
	let requests = 0;
	function start(
		controller: ReadableStreamDefaultController<Uint8Array>,
	): void {
		controller.enqueue(new TextEncoder().encode('{"decision":'));
	}
	function receive(): Response {
		requests++;
		return new Response(new ReadableStream({ start }), {
			headers: { "content-type": "application/json" },
		});
	}
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });
	function findOwner() {
		return { partition: 0, endpoint: server.url.origin, routeEpoch: "1" };
	}
	async function refresh(): Promise<void> {
		throw new Error("Must not refresh uncertain writes");
	}
	try {
		const client = createBalanceWorkerClient({
			ctx: { owners: { findOwner, refresh } },
			config: { partitionCount: 1, timeoutMs: 30 },
		});
		await expect(client.track({ command })).rejects.toMatchObject({
			code: "DEADLINE",
			outcome: "unknown",
		});
		expect(requests).toBe(1);
	} finally {
		await server.stop(true);
	}
}

test(
	"a response body timeout is uncertain and never retried",
	preservesBodyTimeoutAmbiguity,
);
