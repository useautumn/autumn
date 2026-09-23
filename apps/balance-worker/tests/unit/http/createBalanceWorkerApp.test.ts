import { describe, expect, spyOn, test } from "bun:test";
import {
	applyMutation,
	catalogRowsToCatalog,
	computeCheck,
	computeTrack,
	createSubjectState,
	parseCheckCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import { Hono } from "hono";
import { FlushRecordRefusedError } from "../../../src/committer/committerErrors.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { requestValidationMiddleware } from "../../../src/http/middlewares/requestValidationMiddleware.js";
import { runtimeRoutingMiddleware } from "../../../src/http/middlewares/runtimeRouting/runtimeRoutingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import { createRuntimeDirectory } from "../../../src/partitions/directory/createRuntimeDirectory.js";
import { SubjectStaleError } from "../../../src/processor/subject/subjectErrors.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterRecordTooLargeError,
	PartitionWriterStateNotFoundError,
} from "../../../src/processor/writer/writerErrors.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";
import {
	createCustomerEntitlement,
	createSubjectFor,
} from "../../fixtures/mutations.js";
import { createTestRuntimeResources } from "../kafka/kafka-test-fixtures.js";

const command = parseTrackCommand({
	input: {
		schemaVersion: 1,
		type: "track",
		org: {
			slug: "acme",
			config: {
				reverse_deduction_order: false,
				block_overdue_entitlements: false,
				include_past_due: true,
			},
		},
		commandId: "cmd",
		requestId: "req",
		identity: {
			orgId: "org",
			env: "sandbox",
			customerId: "customer",
			entityId: null,
		},
		featureId: "messages",
		internalFeatureId: "feat_messages",
		value: 2,
		overageBehavior: "reject",
		properties: null,
		occurredAt: 1,
	},
});
const state = createSubjectState({
	identity: command.identity,
	customerEntitlements: [
		createCustomerEntitlement({
			id: "balance",
			featureId: "messages",
			balance: 10,
		}),
	],
});
const mutation = computeTrack({
	fullSubject: createSubjectFor({ state }),
	command,
});
if (mutation.result.type !== "track") throw new Error("Expected a track");
const trackReply = {
	result: mutation.result,
	changes: mutation.changes,
	state: applyMutation({ state, mutation }),
	catalog: catalogRowsToCatalog({ rows: [] }),
};
const route = { partition: 2, routeEpoch: "9007199254740993" };
const request = { route, command };
const fixture = ({
	cause,
	owned = true,
	actualPartition = 2,
	causeFor,
}: {
	cause?: Error;
	owned?: boolean;
	actualPartition?: number;
	/** Fails individual tracks by command id, for batches that mix outcomes. */
	causeFor?: Record<string, Error>;
} = {}) => {
	const logs: unknown[][] = [];
	function recordLog(...args: unknown[]): void {
		logs.push(args);
	}
	const submitted: unknown[] = [];
	const lookups: PartitionRoute[] = [];
	const processor: PartitionProcessor = {
		execute: ({ run }) => run(processor),
		initialize: async () => {
			throw new Error("Initialization is not configured in this fixture");
		},
		applyBillingPlan: async () => {
			throw new Error("Billing plans are not configured in this fixture");
		},
		track: async (params) => {
			submitted.push(params);
			if (cause) throw cause;
			const itemCause = causeFor?.[params.command.commandId];
			if (itemCause) throw itemCause;
			return trackReply;
		},
		check: async ({ command }) => ({
			result: computeCheck({
				fullSubject: createSubjectFor({ state }),
				command,
			}),
			state,
			catalog: catalogRowsToCatalog({ rows: [] }),
		}),
		readSubjectState: async () => ({
			state,
			catalog: catalogRowsToCatalog({ rows: [] }),
		}),
		evict: async () => ({ evicted: false }),
		finalize: async () => {
			throw new Error("Finalize is not configured in this fixture");
		},
		confirmExpiredLock: async () => {
			throw new Error("Expire lock is not configured in this fixture");
		},
		reset: async () => {
			throw new Error("Reset is not configured in this fixture");
		},
		drain: async () => undefined,
	};
	const process: BalanceWorkerRequestContext["runtime"]["process"] = (run) =>
		run(processor);
	const runtime = { process };
	const findRuntime = (requested: PartitionRoute) => {
		lookups.push(requested);
		return owned &&
			requested.partition === route.partition &&
			requested.routeEpoch === route.routeEpoch
			? runtime
			: undefined;
	};
	const ctx: BalanceWorkerHttpContext = {
		ownership: { findRuntime },
		partitionResolver: { partitionForIdentity: () => actualPartition },
		logger: {
			debug: recordLog,
			info: recordLog,
			warn: recordLog,
			error: recordLog,
		},
	};
	const app = createBalanceWorkerApp({ ctx });
	const post = (body: unknown = request) =>
		app.request("/v1/track", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const postBatch = (body: unknown) =>
		app.request("/v1/track-batch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return { app, ctx, post, postBatch, submitted, lookups, logs };
};

test(
	"logs one completed request with correlation and outcome, without properties",
	logsCompletedRequest,
);
test(
	"logs expected and unexpected failures once with their original cause",
	logsFailedRequest,
);
test("logs early rejections and unmatched paths once", logsEarlyRequest);
test(
	"logs an overload rejection without its error, so shedding load stays cheap",
	logsOverloadCheaply,
);
test("keeps concurrent request logs separate", isolatesRequestLogs);
test(
	"logging failures cannot change the response",
	preservesResponseOnLoggingFailure,
);

async function logsCompletedRequest(): Promise<void> {
	const { post, logs } = fixture();
	const response = await post({
		...request,
		command: { ...command, properties: { private: "never-log-this" } },
	});
	expect(response.status).toBe(200);
	expect(logs).toHaveLength(1);
	expect(logs[0][0]).toMatchObject({
		event: "balance_worker.request",
		req: {
			id: "req",
			method: "POST",
			path: "/v1/track",
			body: expect.objectContaining({ commandId: "cmd" }),
		},
		res: trackReply,
		statusCode: 200,
		durationMs: expect.any(Number),
		context: {
			org_id: "org",
			org_slug: "acme",
			customer_id: "customer",
			env: "sandbox",
		},
		data: {
			commandId: "cmd",
			featureId: "messages",
			value: 2,
			route,
			revision: 1,
			status: "applied",
		},
	});
	expect(JSON.stringify(logs)).not.toContain("never-log-this");
}

async function logsFailedRequest(): Promise<void> {
	for (const [cause, statusCode, errorCode] of [
		[
			new PartitionWriterStateNotFoundError({ customerKey: "missing" }),
			409,
			"NOT_INITIALIZED",
		],
		[new Error("failed write"), 500, "INTERNAL"],
	] as const) {
		const { post, logs } = fixture({ cause });
		const response = await post();
		expect(response.status).toBe(statusCode);
		expect(logs).toHaveLength(1);
		expect(logs[0][0]).toMatchObject({
			statusCode,
			req: { id: "req" },
			errorCode,
			error: cause,
			data: { route },
		});
		expect(logs[0][1]).toContain(cause.name);
	}
}

async function logsOverloadCheaply(): Promise<void> {
	const { post, logs } = fixture({ cause: new PartitionWriterCapacityError() });
	const response = await post();
	expect(response.status).toBe(429);
	expect(logs).toHaveLength(1);
	const [event, message] = logs[0] as [Record<string, unknown>, string];
	// Serialising a stack per rejected request made overload collapse throughput on staging.
	expect(event).toMatchObject({ statusCode: 429, errorCode: "OVERLOADED" });
	expect(event.error).toBeUndefined();
	expect(message).not.toContain("PartitionWriterCapacityError");
}

async function logsEarlyRequest(): Promise<void> {
	const { app, post, logs } = fixture({ owned: false });
	expect((await post()).status).toBe(409);
	expect((await post(null)).status).toBe(400);
	expect((await app.request("/missing")).status).toBe(404);
	expect(logs).toHaveLength(3);
	for (const [index, statusCode] of [409, 400, 404].entries()) {
		expect(logs[index][0]).toMatchObject({
			statusCode,
			req: { id: expect.any(String) },
		});
	}
}

async function isolatesRequestLogs(): Promise<void> {
	const { post, logs } = fixture();
	await Promise.all([
		post({
			...request,
			command: { ...command, requestId: "first", commandId: "first" },
		}),
		post({
			...request,
			command: { ...command, requestId: "second", commandId: "second" },
		}),
	]);
	expect(logs).toHaveLength(2);
	for (const id of ["first", "second"]) {
		expect(logs).toContainEqual([
			expect.objectContaining({
				req: expect.objectContaining({ id }),
				data: expect.objectContaining({ commandId: id }),
			}),
			expect.any(String),
		]);
	}
}

function failLog(): never {
	throw new Error("logging unavailable");
}

function ignoreLog(): void {}

async function preservesResponseOnLoggingFailure(): Promise<void> {
	const { ctx, post } = fixture();
	ctx.logger.info = failLog;
	const fallback = spyOn(console, "error").mockImplementation(ignoreLog);
	try {
		const response = await post();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(trackReply);
		expect(fallback).toHaveBeenCalledTimes(1);
	} finally {
		fallback.mockRestore();
	}
}

describe("Balance worker HTTP", () => {
	test("returns the committed response without coercing the route epoch", async () => {
		const { post, submitted, lookups } = fixture();
		const response = await post();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(trackReply);
		expect(submitted).toEqual([{ command }]);
		expect(lookups).toEqual([route]);
	});
	test.each([
		null,
		{},
		{ command },
		{ ...request, route: { ...route, routeEpoch: "01" } },
		{ ...request, route: { ...route, routeEpoch: 1 } },
		{ route },
		{ ...request, command: null },
		{ ...request, command: {} },
		{
			...request,
			command: {
				...command,
				identity: { ...command.identity, customerId: "" },
			},
		},
		{ ...request, extra: true },
	])("rejects invalid wire request %j", async (body) => {
		const { post, submitted, lookups } = fixture();
		const response = await post(body);
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe("INVALID_REQUEST");
		expect(submitted).toEqual([]);
		expect(lookups).toEqual([]);
	});
	test.each([
		{ ...command, schemaVersion: 2 },
		{ ...command, type: "check" },
	])(
		"track handler rejects invalid commands after routing",
		async (invalidCommand) => {
			const { post, submitted, lookups } = fixture();
			const response = await post({ route, command: invalidCommand });
			expect(response.status).toBe(400);
			expect((await response.json()).error.code).toBe("INVALID_REQUEST");
			expect(lookups).toEqual([route]);
			expect(submitted).toEqual([]);
		},
	);
	test("rejects malformed and empty JSON before routing", async () => {
		const { app, submitted, lookups } = fixture();
		for (const body of ["{", ""]) {
			const response = await app.request("/v1/track", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			});
			expect(response.status).toBe(400);
			expect((await response.json()).error.code).toBe("INVALID_REQUEST");
		}
		expect(submitted).toEqual([]);
		expect(lookups).toEqual([]);
	});
	test.each(["fixed", "streamed"] as const)(
		"Bun rejects oversized %s bodies before runtime lookup",
		async (mode) => {
			const { app, submitted, lookups } = fixture();
			const server = Bun.serve({
				hostname: "127.0.0.1",
				port: 0,
				maxRequestBodySize: 2048,
				fetch: app.fetch,
			});
			const payload = JSON.stringify({
				...request,
				command: { ...command, properties: { padding: "x".repeat(4096) } },
			});
			const bytes = new TextEncoder().encode(payload);
			const body =
				mode === "fixed"
					? payload
					: new ReadableStream({
							start(controller) {
								controller.enqueue(bytes.slice(0, 1024));
								controller.enqueue(bytes.slice(1024));
								controller.close();
							},
						});
			try {
				const response = await fetch(new URL("/v1/track", server.url), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				});
				expect(response.status).toBe(413);
				await response.text();
				expect(lookups).toEqual([]);
				expect(submitted).toEqual([]);
			} finally {
				await server.stop(true);
			}
		},
	);
	test("shared middleware routes a check command without track validation", async () => {
		const { ctx, lookups, submitted } = fixture();
		const checkCommand = parseCheckCommand({
			input: {
				schemaVersion: 1,
				type: "check",
				org: {
					config: {
						reverse_deduction_order: false,
						block_overdue_entitlements: false,
						include_past_due: true,
					},
				},
				requestId: "check-request",
				identity: command.identity,
				featureId: "messages",
				internalFeatureId: "feat_messages",
				requiredBalance: 2,
				properties: null,
				occurredAt: 1,
			},
		});
		const app = new Hono<BalanceWorkerHttpEnv>();
		app.post(
			"/check",
			requestValidationMiddleware,
			runtimeRoutingMiddleware({ ctx }),
			async (context) => {
				const command = parseCheckCommand({
					input: context.get("request").command,
				});
				const checked = await context
					.get("ctx")
					.runtime.process((processor) => processor.check({ command }));
				return context.json(checked);
			},
		);
		const response = await app.request("/check", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ route, command: checkCommand }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			result: computeCheck({
				fullSubject: createSubjectFor({ state }),
				command: checkCommand,
			}),
			state,
			catalog: catalogRowsToCatalog({ rows: [] }),
		});
		expect(lookups).toEqual([route]);
		expect(submitted).toEqual([]);
	});
	test("rejects command/route partition mismatch before lookup", async () => {
		const { post, submitted, lookups } = fixture({ actualPartition: 1 });
		const response = await post();
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe("INVALID_REQUEST");
		expect(submitted).toEqual([]);
		expect(lookups).toEqual([]);
	});
	test("rejects stale and unowned routes", async () => {
		for (const owned of [true, false]) {
			const { post, submitted } = fixture({ owned });
			const response = await post({
				...request,
				route: { ...route, routeEpoch: "1" },
			});
			expect(response.status).toBe(409);
			expect((await response.json()).error.code).toBe("NOT_OWNER");
			expect(submitted).toEqual([]);
		}
	});
	test("maps runtime readiness races centrally", async () => {
		const { post } = fixture({
			cause: new OwnedPartitionNotReadyError({ status: "draining" }),
		});
		const response = await post();
		expect(response.status).toBe(503);
		expect((await response.json()).error.code).toBe("NOT_READY");
	});
	test.each([
		new Error("secret details"),
		new SyntaxError("internal decoder failed"),
		new OwnedPartitionRecoveryRequiredError({
			topic: "metering",
			partition: 2,
			cause: new Error("uncertain commit"),
		}),
	])("never reports failed or uncertain writes as success", async (cause) => {
		const { post } = fixture({ cause });
		const response = await post();
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: { code: "INTERNAL", message: "Worker request failed" },
		});
	});
	test.each([
		{
			cause: new PartitionWriterStateNotFoundError({ customerKey: "missing" }),
			status: 409,
			code: "NOT_INITIALIZED",
		},
		{
			cause: new PartitionWriterCapacityError(),
			status: 429,
			code: "OVERLOADED",
		},
		{
			cause: new PartitionWriterRecordTooLargeError({
				bytes: 2_000_000,
				maxBatchBytes: 800_000,
			}),
			status: 422,
			code: "RECORD_TOO_LARGE",
		},
		{
			cause: new SubjectStaleError({
				identity: command.identity,
				cause: new Error("rows moved"),
			}),
			status: 409,
			code: "STALE_SUBJECT",
		},
		{
			cause: new FlushRecordRefusedError({
				mutationId: "cmd",
				cause: new Error("value out of range"),
			}),
			status: 500,
			code: "RECORD_REFUSED",
		},
	])(
		"reports unavailable state or capacity without inventing balances",
		async ({ cause, status, code }) => {
			const response = await fixture({ cause }).post();
			expect(response.status).toBe(status);
			expect((await response.json()).error.code).toBe(code);
		},
	);
	test("withdraws a stale healthy admission when runtime health fails", async () => {
		let unavailable = false;
		const directory = createRuntimeDirectory();
		const resources = createTestRuntimeResources({
			runtime: {
				start: async () => undefined,
				stop: async () => undefined,
				getHealth: () => ({
					topic: "metering",
					partition: 2,
					status: unavailable ? "recovery_required" : "ready",
					localNextOffset: 0n,
					consumedNextOffset: 0n,
					highWatermark: 0n,
					lag: 0n,
					failureReason: unavailable ? "failed" : null,
				}),
			},
		});
		directory.admit({ ...route, runtime: resources.runtime });
		unavailable = true;
		const app = createBalanceWorkerApp({
			ctx: {
				ownership: directory,
				partitionResolver: { partitionForIdentity: () => 2 },
				logger: fixture().ctx.logger,
			},
		});
		const response = await app.request("/v1/track", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
		expect(response.status).toBe(409);
		expect((await response.json()).error.code).toBe("NOT_OWNER");
		unavailable = false;
		expect(directory.findRuntime(route)).toBeUndefined();
	});
	test("reports liveness without claiming any partition ready", async () => {
		const { app, lookups } = fixture({ owned: false });
		const response = await app.request("/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "alive" });
		expect(lookups).toEqual([]);
	});
});

function commandWithId(id: string) {
	return { ...command, commandId: id, requestId: id };
}

describe("Track batches", () => {
	test("answers every command in order, mapping failures exactly as /v1/track does", async () => {
		const causeFor: Record<string, Error> = {
			overloaded: new PartitionWriterCapacityError(),
			"too-large": new PartitionWriterRecordTooLargeError({
				bytes: 2_000_000,
				maxBatchBytes: 800_000,
			}),
			missing: new PartitionWriterStateNotFoundError({
				customerKey: "missing",
			}),
			broken: new Error("secret details"),
		};
		const { postBatch, submitted, lookups } = fixture({ causeFor });
		const ids = [
			"first",
			"overloaded",
			"too-large",
			"missing",
			"broken",
			"last",
		];
		const response = await postBatch({
			route,
			commands: ids.map(commandWithId),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			results: [
				{ ok: true, reply: trackReply },
				{
					ok: false,
					status: 429,
					error: {
						code: "OVERLOADED",
						message:
							"Partition is at capacity for this customer; retry with backoff",
					},
				},
				{
					ok: false,
					status: 422,
					error: {
						code: "RECORD_TOO_LARGE",
						message:
							"This customer's state is too large to write in one record; nothing was applied",
					},
				},
				{
					ok: false,
					status: 409,
					error: {
						code: "NOT_INITIALIZED",
						message: "Customer must be initialized before check or track",
					},
				},
				{
					ok: false,
					status: 500,
					error: { code: "INTERNAL", message: "Worker request failed" },
				},
				{ ok: true, reply: trackReply },
			],
		});
		expect(submitted).toEqual(
			ids.map((id) => ({ command: commandWithId(id) })),
		);
		// Ownership is checked once for the whole batch.
		expect(lookups).toEqual([route]);
	});

	test("runs a batch's commands concurrently so the writer can coalesce them", async () => {
		const gate = Promise.withResolvers<void>();
		const { ctx, postBatch } = fixture();
		let started = 0;
		const runtime = ctx.ownership.findRuntime(route);
		if (!runtime) throw new Error("Fixture must own the route");
		const process = runtime.process;
		ctx.ownership.findRuntime = () => ({
			process: async (run) => {
				started++;
				await gate.promise;
				return process(run);
			},
		});
		const pending = postBatch({
			route,
			commands: ["a", "b", "c"].map(commandWithId),
		});
		for (let turn = 0; turn < 20 && started < 3; turn++)
			await new Promise((resolve) => setImmediate(resolve));
		expect(started).toBe(3);
		gate.resolve();
		expect((await pending).status).toBe(200);
	});

	test("an invalid command fails alone as INVALID_REQUEST", async () => {
		const { postBatch, submitted } = fixture();
		const response = await postBatch({
			route,
			commands: [
				commandWithId("a"),
				{ ...commandWithId("b"), schemaVersion: 2 },
				{ ...commandWithId("c"), type: "check" },
				commandWithId("d"),
			],
		});
		expect(response.status).toBe(200);
		const { results } = await response.json();
		expect(results.map((result: { ok: boolean }) => result.ok)).toEqual([
			true,
			false,
			false,
			true,
		]);
		for (const index of [1, 2])
			expect(results[index]).toEqual({
				ok: false,
				status: 400,
				error: { code: "INVALID_REQUEST", message: "Invalid worker request" },
			});
		expect(submitted).toEqual([
			{ command: commandWithId("a") },
			{ command: commandWithId("d") },
		]);
	});

	test("a command for another partition fails alone as INVALID_REQUEST", async () => {
		const { postBatch, submitted } = fixture({ actualPartition: 1 });
		const response = await postBatch({ route, commands: [commandWithId("a")] });
		expect(response.status).toBe(200);
		expect((await response.json()).results).toEqual([
			{
				ok: false,
				status: 400,
				error: { code: "INVALID_REQUEST", message: "Invalid worker request" },
			},
		]);
		expect(submitted).toEqual([]);
	});

	test("an unowned or stale route answers the whole batch NOT_OWNER, like /v1/track", async () => {
		for (const owned of [true, false]) {
			const { post, postBatch, submitted } = fixture({ owned });
			const staleRoute = { ...route, routeEpoch: "1" };
			const response = await postBatch({
				route: staleRoute,
				commands: [commandWithId("a"), commandWithId("b")],
			});
			const single = await post({ route: staleRoute, command });
			expect(response.status).toBe(409);
			expect(await response.json()).toEqual(await single.json());
			expect(submitted).toEqual([]);
		}
	});

	test.each([
		null,
		{},
		{ route },
		{ commands: [command] },
		{ route, commands: [] },
		{ route, commands: command },
		{ route, commands: [command], extra: true },
		{ route: { ...route, routeEpoch: "01" }, commands: [command] },
		{ route, commands: Array.from({ length: 1001 }, () => command) },
	])("rejects invalid batch envelope %#", async (body) => {
		const { postBatch, submitted, lookups } = fixture();
		const response = await postBatch(body);
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe("INVALID_REQUEST");
		expect(submitted).toEqual([]);
		expect(lookups).toEqual([]);
	});

	test("logs one line per batch with its size and failures counted by code", async () => {
		const { postBatch, logs } = fixture({
			causeFor: {
				b: new PartitionWriterCapacityError(),
				c: new PartitionWriterCapacityError(),
				d: new PartitionWriterStateNotFoundError({ customerKey: "missing" }),
			},
		});
		const response = await postBatch({
			route,
			commands: ["a", "b", "c", "d"].map((id) => ({
				...commandWithId(id),
				properties: { private: "never-log-this" },
			})),
		});
		expect(response.status).toBe(200);
		expect(logs).toHaveLength(1);
		const [event] = logs[0] as [Record<string, unknown>, string];
		expect(event).toMatchObject({
			event: "balance_worker.request",
			statusCode: 200,
			req: { method: "POST", path: "/v1/track-batch" },
			context: { org_id: "org", customer_id: "customer" },
			data: {
				route,
				batch: {
					count: 4,
					succeeded: 1,
					failed: 3,
					errorCodes: { OVERLOADED: 2, NOT_INITIALIZED: 1 },
				},
			},
		});
		// Failures are counted, not serialised one stack at a time.
		expect(event.error).toBeUndefined();
		expect(JSON.stringify(logs)).not.toContain("never-log-this");
	});

	test("keeps one unexpected failure's cause per batch, not one per command", async () => {
		const first = new Error("first failure");
		const { postBatch, logs } = fixture({
			causeFor: { a: first, b: new Error("second failure") },
		});
		await postBatch({ route, commands: ["a", "b"].map(commandWithId) });
		expect(logs).toHaveLength(1);
		expect(logs[0][0]).toMatchObject({
			error: first,
			data: { batch: { failed: 2, errorCodes: { INTERNAL: 2 } } },
		});
	});
});
