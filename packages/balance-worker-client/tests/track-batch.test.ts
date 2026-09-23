import { expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import {
	createBalanceWorkerClient,
	type PartitionOwner,
	type TrackReply,
} from "../src/balanceWorkerClient.js";
import type {
	HttpRequest,
	HttpResponse,
} from "../src/http/types/httpClient.js";

const baseCommand: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	org: {
		config: {
			reverse_deduction_order: false,
			block_overdue_entitlements: false,
			include_past_due: true,
		},
	},
	commandId: "command",
	requestId: "request",
	identity: {
		orgId: "org",
		env: "sandbox",
		customerId: "customer",
		entityId: null,
	},
	featureId: "feature",
	internalFeatureId: "feat_feature",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	occurredAt: 0,
};

function commandFor(id: string, customerId = "customer"): TrackCommand {
	return {
		...structuredClone(baseCommand),
		commandId: id,
		requestId: id,
		identity: { ...baseCommand.identity, customerId },
	};
}

/** The client never reads a reply, so a marker stands in for one. */
function replyFor(id: string): TrackReply {
	return { marker: id } as unknown as TrackReply;
}

function okResults(ids: string[]): HttpResponse {
	return {
		status: 200,
		body: { results: ids.map((id) => ({ ok: true, reply: replyFor(id) })) },
	};
}

const notOwner: HttpResponse = {
	status: 409,
	body: { error: { code: "NOT_OWNER", message: "Stale route" } },
};

const initialOwner: PartitionOwner = {
	partition: 0,
	routeEpoch: "1",
	endpoint: "http://worker-a:8080",
};
const replacement: PartitionOwner = {
	partition: 0,
	routeEpoch: "2",
	endpoint: "http://worker-b:8080",
};

type PendingRequest = {
	url: string;
	body: { route: unknown; commands: TrackCommand[] };
	signal: AbortSignal;
	respond(response: HttpResponse): void;
	fail(cause: Error): void;
};

function createFixture({
	owner = initialOwner,
	nextOwner = replacement,
	timeoutMs = 1000,
	partitionCount = 1,
	maxTrackBatchSize,
}: {
	owner?: PartitionOwner | null;
	nextOwner?: PartitionOwner | null;
	timeoutMs?: number;
	partitionCount?: number;
	maxTrackBatchSize?: number;
} = {}) {
	let currentOwner = owner;
	let refreshes = 0;
	const requests: PendingRequest[] = [];
	const waiters: Array<{ count: number; resolve(): void }> = [];
	function findOwner({
		partition,
	}: {
		partition: number;
	}): PartitionOwner | undefined {
		return currentOwner ? { ...currentOwner, partition } : undefined;
	}
	async function refresh(): Promise<void> {
		refreshes++;
		currentOwner = nextOwner;
	}
	function postJson(request: HttpRequest): Promise<HttpResponse> {
		const response = Promise.withResolvers<HttpResponse>();
		requests.push({
			url: request.url,
			body: structuredClone(request.body) as PendingRequest["body"],
			signal: request.signal,
			respond: response.resolve,
			fail: response.reject,
		});
		for (const waiter of waiters.splice(0))
			if (requests.length >= waiter.count) waiter.resolve();
			else waiters.push(waiter);
		return response.promise;
	}
	/** Resolves once `count` requests have been sent, without any timer. */
	function sent(count: number): Promise<void> {
		if (requests.length >= count) return Promise.resolve();
		const waiter = Promise.withResolvers<void>();
		waiters.push({ count, resolve: waiter.resolve });
		return waiter.promise;
	}
	const client = createBalanceWorkerClient({
		ctx: { owners: { findOwner, refresh }, http: { postJson } },
		config: { partitionCount, timeoutMs, maxTrackBatchSize },
	});
	return {
		client,
		requests,
		sent,
		refreshes: () => refreshes,
	};
}

function idsOf(request: PendingRequest): string[] {
	return request.body.commands.map((command) => command.commandId);
}

/** Lets settled promises run their callbacks before the next assertion. */
async function flush(): Promise<void> {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

test("an idle partition sends a track at once, as a batch of one", async () => {
	const fixture = createFixture();
	const command = commandFor("a");
	const pending = fixture.client.track({ command });
	// Synchronous: no timer, no microtask hop before the request leaves.
	expect(fixture.requests).toHaveLength(1);
	expect(fixture.requests[0].url).toBe("http://worker-a:8080/v1/track-batch");
	expect(fixture.requests[0].body).toEqual({
		route: { partition: 0, routeEpoch: "1" },
		commands: [command],
	});
	fixture.requests[0].respond(okResults(["a"]));
	expect(await pending).toEqual(replyFor("a"));
});

test("tracks that arrive while a batch is in flight go out together next", async () => {
	const fixture = createFixture();
	const first = fixture.client.track({ command: commandFor("a") });
	const rest = ["b", "c", "d"].map((id) =>
		fixture.client.track({ command: commandFor(id) }),
	);
	expect(fixture.requests).toHaveLength(1);
	fixture.requests[0].respond(okResults(["a"]));
	expect(await first).toEqual(replyFor("a"));
	await fixture.sent(2);
	expect(idsOf(fixture.requests[1])).toEqual(["b", "c", "d"]);
	fixture.requests[1].respond(okResults(["b", "c", "d"]));
	expect(await Promise.all(rest)).toEqual(["b", "c", "d"].map(replyFor));
	expect(fixture.requests).toHaveLength(2);
});

test("a batch never exceeds the maximum size", async () => {
	const fixture = createFixture({ maxTrackBatchSize: 2 });
	const ids = ["a", "b", "c", "d", "e"];
	const pending = ids.map((id) =>
		fixture.client.track({ command: commandFor(id) }),
	);
	expect(idsOf(fixture.requests[0])).toEqual(["a"]);
	fixture.requests[0].respond(okResults(["a"]));
	await fixture.sent(2);
	expect(idsOf(fixture.requests[1])).toEqual(["b", "c"]);
	fixture.requests[1].respond(okResults(["b", "c"]));
	await fixture.sent(3);
	expect(idsOf(fixture.requests[2])).toEqual(["d", "e"]);
	fixture.requests[2].respond(okResults(["d", "e"]));
	expect(await Promise.all(pending)).toEqual(ids.map(replyFor));
});

test("partitions batch independently", async () => {
	let otherCustomer = "other-0";
	for (let index = 0; ; index++) {
		otherCustomer = `other-${index}`;
		const partition = meteringIdentityToPartition({
			identity: commandFor("x", otherCustomer).identity,
			partitionCount: 2,
		});
		const basePartition = meteringIdentityToPartition({
			identity: baseCommand.identity,
			partitionCount: 2,
		});
		if (partition !== basePartition) break;
	}
	const fixture = createFixture({ partitionCount: 2 });
	fixture.client.track({ command: commandFor("a") });
	fixture.client.track({ command: commandFor("b", otherCustomer) });
	expect(fixture.requests.map(idsOf)).toEqual([["a"], ["b"]]);
});

test("per-item results settle each caller with today's error mapping", async () => {
	const fixture = createFixture();
	const first = fixture.client.track({ command: commandFor("first") });
	const ids = ["ok", "overloaded", "internal", "missing", "too-large"];
	const pending = ids.map((id) =>
		fixture.client.track({ command: commandFor(id) }),
	);
	fixture.requests[0].respond(okResults(["first"]));
	await first;
	await fixture.sent(2);
	fixture.requests[1].respond({
		status: 200,
		body: {
			results: [
				{ ok: true, reply: replyFor("ok") },
				{
					ok: false,
					status: 429,
					error: { code: "OVERLOADED", message: "Busy" },
				},
				{
					ok: false,
					status: 500,
					error: { code: "INTERNAL", message: "Worker request failed" },
				},
				{
					ok: false,
					status: 409,
					error: { code: "NOT_INITIALIZED", message: "Missing" },
				},
				{
					ok: false,
					status: 422,
					error: { code: "RECORD_TOO_LARGE", message: "Too large" },
				},
			],
		},
	});
	const settled = await Promise.allSettled(pending);
	expect(settled[0]).toEqual({ status: "fulfilled", value: replyFor("ok") });
	for (const [index, workerCode, outcome] of [
		[1, "OVERLOADED", "not_submitted"],
		[2, "INTERNAL", "unknown"],
		[3, "NOT_INITIALIZED", "not_submitted"],
		[4, "RECORD_TOO_LARGE", "not_submitted"],
	] as const) {
		expect(settled[index]).toMatchObject({
			status: "rejected",
			reason: { code: "WORKER_ERROR", workerCode, outcome },
		});
	}
});

test("a per-item error whose status does not match its code is an invalid response", async () => {
	const fixture = createFixture();
	const pending = fixture.client.track({ command: commandFor("a") });
	fixture.requests[0].respond({
		status: 200,
		body: {
			results: [
				{
					ok: false,
					status: 500,
					error: { code: "OVERLOADED", message: "Busy" },
				},
			],
		},
	});
	await expect(pending).rejects.toMatchObject({
		code: "INVALID_RESPONSE",
		outcome: "unknown",
	});
});

test("a reply that does not answer every command fails the whole batch as uncertain", async () => {
	for (const body of [
		{ results: [] },
		{ results: [{ ok: true, reply: replyFor("a") }, { ok: true }] },
		{},
		null,
	]) {
		const fixture = createFixture();
		const pending = fixture.client.track({ command: commandFor("a") });
		fixture.requests[0].respond({ status: 200, body });
		await expect(pending).rejects.toMatchObject({
			code: "INVALID_RESPONSE",
			outcome: "unknown",
		});
	}
});

test("a batch-level worker error rejects every item without rerouting", async () => {
	const fixture = createFixture();
	const pending = fixture.client.track({ command: commandFor("a") });
	fixture.requests[0].respond({
		status: 503,
		body: { error: { code: "NOT_READY", message: "Draining" } },
	});
	await expect(pending).rejects.toMatchObject({
		code: "WORKER_ERROR",
		workerCode: "NOT_READY",
		outcome: "not_submitted",
	});
	expect(fixture.refreshes()).toBe(0);
});

test("a queued item past its deadline rejects not_submitted and is never sent", async () => {
	const fixture = createFixture({ timeoutMs: 30 });
	const inFlight = fixture.client.track({ command: commandFor("a") });
	const queued = fixture.client.track({ command: commandFor("b") });
	const [queuedResult, inFlightResult] = await Promise.allSettled([
		queued,
		inFlight,
	]);
	expect(queuedResult).toMatchObject({
		status: "rejected",
		reason: { code: "DEADLINE", outcome: "not_submitted" },
	});
	// The in-flight item may already have applied, so it cannot claim otherwise.
	expect(inFlightResult).toMatchObject({
		status: "rejected",
		reason: { code: "DEADLINE", outcome: "unknown" },
	});
	// Once nobody waits on the batch, its request is cancelled.
	expect(fixture.requests[0].signal.aborted).toBe(true);
	fixture.requests[0].respond(okResults(["a"]));
	await flush();
	expect(fixture.requests).toHaveLength(1);
});

test("an aborted queued item is dropped, an aborted in-flight one is uncertain", async () => {
	const fixture = createFixture();
	const inFlightAbort = new AbortController();
	const queuedAbort = new AbortController();
	const inFlight = fixture.client.track({
		command: commandFor("a"),
		signal: inFlightAbort.signal,
	});
	const sibling = fixture.client.track({ command: commandFor("b") });
	const queued = fixture.client.track({
		command: commandFor("c"),
		signal: queuedAbort.signal,
	});
	const sent = fixture.client.track({ command: commandFor("d") });
	inFlightAbort.abort();
	queuedAbort.abort();
	await expect(inFlight).rejects.toMatchObject({
		code: "ABORTED",
		outcome: "unknown",
	});
	await expect(queued).rejects.toMatchObject({
		code: "ABORTED",
		outcome: "not_submitted",
	});
	// Its only item gave up, so the first batch's request is cancelled.
	expect(fixture.requests[0].signal.aborted).toBe(true);
	fixture.requests[0].respond(okResults(["a"]));
	await fixture.sent(2);
	expect(idsOf(fixture.requests[1])).toEqual(["b", "d"]);
	fixture.requests[1].respond(okResults(["b", "d"]));
	expect(await sibling).toEqual(replyFor("b"));
	expect(await sent).toEqual(replyFor("d"));
});

test("a canceled track never sends", async () => {
	const fixture = createFixture();
	await expect(
		fixture.client.track({
			command: commandFor("a"),
			signal: AbortSignal.abort(),
		}),
	).rejects.toMatchObject({ code: "ABORTED", outcome: "not_submitted" });
	expect(fixture.requests).toHaveLength(0);
});

test("a batch-level NOT_OWNER refreshes once and resends the live items", async () => {
	const fixture = createFixture();
	const first = fixture.client.track({ command: commandFor("a") });
	const pending = ["b", "c"].map((id) =>
		fixture.client.track({ command: commandFor(id) }),
	);
	fixture.requests[0].respond(okResults(["a"]));
	await first;
	await fixture.sent(2);
	fixture.requests[1].respond(notOwner);
	await fixture.sent(3);
	expect(fixture.refreshes()).toBe(1);
	expect(fixture.requests[2].url).toBe("http://worker-b:8080/v1/track-batch");
	expect(fixture.requests[2].body).toEqual({
		route: { partition: 0, routeEpoch: "2" },
		commands: [commandFor("b"), commandFor("c")],
	});
	fixture.requests[2].respond(okResults(["b", "c"]));
	expect(await Promise.all(pending)).toEqual(["b", "c"].map(replyFor));
});

test("a route still stale after one refresh rejects not_submitted", async () => {
	const fixture = createFixture();
	const pending = fixture.client.track({ command: commandFor("a") });
	fixture.requests[0].respond(notOwner);
	await fixture.sent(2);
	fixture.requests[1].respond(notOwner);
	await expect(pending).rejects.toMatchObject({
		code: "ROUTE_STILL_STALE",
		outcome: "not_submitted",
	});
	expect(fixture.refreshes()).toBe(1);
	expect(fixture.requests).toHaveLength(2);
});

test("a partition with no owner refreshes once, then fails NO_OWNER unsent", async () => {
	const fixture = createFixture({ owner: null, nextOwner: null });
	await expect(
		fixture.client.track({ command: commandFor("a") }),
	).rejects.toMatchObject({ code: "NO_OWNER", outcome: "not_submitted" });
	expect(fixture.refreshes()).toBe(1);
	expect(fixture.requests).toHaveLength(0);
});

test("a transport failure is uncertain for in-flight items only", async () => {
	const fixture = createFixture();
	const inFlight = fixture.client.track({ command: commandFor("a") });
	const queued = fixture.client.track({ command: commandFor("b") });
	fixture.requests[0].fail(new Error("socket reset"));
	await expect(inFlight).rejects.toMatchObject({
		code: "TRANSPORT",
		outcome: "unknown",
	});
	await fixture.sent(2);
	expect(idsOf(fixture.requests[1])).toEqual(["b"]);
	fixture.requests[1].respond(okResults(["b"]));
	expect(await queued).toEqual(replyFor("b"));
	expect(fixture.refreshes()).toBe(0);
});

test("a queued command is snapshotted before the caller can mutate it", async () => {
	const fixture = createFixture();
	fixture.client.track({ command: commandFor("a") });
	const input = commandFor("b");
	const pending = fixture.client.track({ command: input });
	input.value = 999;
	input.identity.customerId = "other";
	fixture.requests[0].respond(okResults(["a"]));
	await fixture.sent(2);
	expect(fixture.requests[1].body.commands).toEqual([commandFor("b")]);
	fixture.requests[1].respond(okResults(["b"]));
	await pending;
});
