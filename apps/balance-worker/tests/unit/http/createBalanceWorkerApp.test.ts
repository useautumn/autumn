import { describe, expect, spyOn, test } from "bun:test";
import {
	computeCheck,
	computeTrack,
	createCustomerMeteringState,
	parseCheckCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import { Hono } from "hono";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { requestValidationMiddleware } from "../../../src/http/middlewares/requestValidationMiddleware.js";
import { runtimeRoutingMiddleware } from "../../../src/http/middlewares/runtimeRouting/runtimeRoutingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import { createRuntimeDirectory } from "../../../src/partitions/directory/createRuntimeDirectory.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";
import {
	PartitionTrackStateNotFoundError,
	PartitionTrackWriterCapacityError,
} from "../../../src/writer/partitionTrackWriter.js";
import { createTestRuntimeResources } from "../kafka/kafka-test-fixtures.js";

const command = parseTrackCommand({
	input: {
		schemaVersion: 1,
		type: "track",
		commandId: "cmd",
		requestId: "req",
		identity: { orgId: "org", env: "sandbox", customerId: "customer" },
		entityId: null,
		featureId: "messages",
		value: 2,
		overageBehavior: "reject",
		properties: null,
		occurredAt: 1,
	},
});
const state = createCustomerMeteringState({
	identity: command.identity,
	featureStatesById: {
		messages: {
			kind: "direct_metered_v1",
			customerEntitlements: [{ id: "balance", balance: 10, usage: 0 }],
		},
	},
});
const decision = computeTrack({ state, command, deduplicationExpiresAt: 1000 });
const route = { partition: 2, routeEpoch: "9007199254740993" };
const request = { route, command };
const fixture = ({
	cause,
	owned = true,
	actualPartition = 2,
}: {
	cause?: Error;
	owned?: boolean;
	actualPartition?: number;
} = {}) => {
	const logs: unknown[][] = [];
	function recordLog(...args: unknown[]): void {
		logs.push(args);
	}
	const submitted: unknown[] = [];
	const lookups: PartitionRoute[] = [];
	const submitTrack: BalanceWorkerRequestContext["runtime"]["submitTrack"] =
		async (params) => {
			submitted.push(params);
			if (cause) throw cause;
			return decision;
		};
	const check: BalanceWorkerRequestContext["runtime"]["check"] = async ({
		command,
	}) => computeCheck({ state, command });
	const runtime = { submitTrack, check };
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
		logger: { info: recordLog, warn: recordLog, error: recordLog },
	};
	const app = createBalanceWorkerApp({ ctx });
	const post = (body: unknown = request) =>
		app.request("/v1/track", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return { app, ctx, post, submitted, lookups, logs };
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
		req: { id: "req", method: "POST", path: "/v1/track" },
		statusCode: 200,
		durationMs: expect.any(Number),
		context: { org_id: "org", customer_id: "customer", env: "sandbox" },
		extras: {
			commandId: "cmd",
			featureId: "messages",
			value: 2,
			route,
			decision: "new",
			status: "applied",
			balanceAfter: 8,
		},
	});
	expect(JSON.stringify(logs)).not.toContain("never-log-this");
}

async function logsFailedRequest(): Promise<void> {
	for (const [cause, statusCode, errorCode] of [
		[
			new PartitionTrackStateNotFoundError({ customerKey: "missing" }),
			503,
			"NOT_READY",
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
			extras: { route, errorCode, error: cause },
		});
		expect(logs[0][1]).toContain(cause.name);
	}
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
				extras: expect.objectContaining({ commandId: id }),
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
		expect(await response.json()).toEqual({ decision });
		expect(fallback).toHaveBeenCalledTimes(1);
	} finally {
		fallback.mockRestore();
	}
}

describe("Balance worker HTTP", () => {
	test("returns the full committed decision without coercing the route epoch", async () => {
		const { post, submitted, lookups } = fixture();
		const response = await post();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ decision });
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
		{ ...command, value: 0 },
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
				requestId: "check-request",
				identity: command.identity,
				entityId: null,
				featureId: "messages",
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
				const decision = await context.get("ctx").runtime.check({ command });
				return context.json({ decision });
			},
		);
		const response = await app.request("/check", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ route, command: checkCommand }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			decision: computeCheck({ state, command: checkCommand }),
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
		new PartitionTrackStateNotFoundError({ customerKey: "missing" }),
		new PartitionTrackWriterCapacityError(),
	])(
		"reports unavailable state or capacity without inventing balances",
		async (cause) => {
			const response = await fixture({ cause }).post();
			expect(response.status).toBe(503);
			expect((await response.json()).error.code).toBe("NOT_READY");
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
