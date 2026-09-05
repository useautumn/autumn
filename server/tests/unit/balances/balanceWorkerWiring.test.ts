import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as workerClient from "@autumn/balance-worker-client";
import * as balanceWorkerConfig from "@autumn/env/balanceWorkerClient";
import * as kafka from "@autumn/kafka";
import {
	ApiVersionClass,
	AppEnv,
	LATEST_VERSION,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { type Context, Hono, type Next } from "hono";
import * as ownershipAccess from "@/external/balanceWorker/getOwnershipConsumer.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";
import * as balanceWorkerTrack from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import * as asyncTrack from "@/internal/balances/track/runAsyncTrack.js";
import * as legacyTrack from "@/internal/balances/track/runTrackWithRollout.js";
import * as featureDeductions from "@/internal/balances/track/utils/getFeatureDeductions.js";
import * as asyncTrackConfig from "@/internal/misc/asyncTrack/asyncTrackStore.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

let balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({});

function readBalanceWorkerClientEnv() {
	return balanceWorkerEnv;
}

function prepareBalanceWorkerConfig(): void {
	balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({});
	spyOn(balanceWorkerConfig, "getBalanceWorkerClientEnv").mockImplementation(
		readBalanceWorkerClientEnv,
	);
}

function restoreMocks(): void {
	mock.restore();
}

function ignoreLog(): void {}

function createContext({
	env = AppEnv.Sandbox,
}: {
	env?: AppEnv;
} = {}): AutumnContext {
	return {
		id: "balance-worker-wiring",
		org: { id: "org_balance_worker", slug: "balance-worker-wiring" },
		env,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [],
		extraLogs: {},
		scopes: [],
		skipCache: false,
		logger: {
			warn: ignoreLog,
			info: ignoreLog,
			error: ignoreLog,
			debug: ignoreLog,
		},
	} as never;
}

function gatesBalanceWorkerToEnabledDevelopmentSandbox(): void {
	for (const [nodeEnv, enabled, requestEnv, expected] of [
		["development", "true", AppEnv.Sandbox, true],
		["development", "false", AppEnv.Sandbox, true],
		["development", "true", AppEnv.Live, false],
		["production", "true", AppEnv.Sandbox, false],
		["test", "true", AppEnv.Sandbox, false],
	] as const) {
		balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({
			NODE_ENV: nodeEnv,
			BALANCE_WORKER_ROLLOUT_ENABLED: enabled,
		});
		expect(
			isBalanceWorkerRolloutEnabled({
				ctx: createContext({ env: requestEnv }),
			}),
		).toBe(expected);
	}
}

async function startsAndMemoizesOnlyWhenEnabled(): Promise<void> {
	let starts = 0;
	let stops = 0;
	let startupFailure: Error | undefined;
	const info = spyOn(logger, "info").mockImplementation(ignoreLog);
	const error = spyOn(logger, "error").mockImplementation(ignoreLog);
	async function start(): Promise<void> {
		starts++;
		if (startupFailure) throw startupFailure;
	}
	async function stop(): Promise<void> {
		stops++;
	}
	function findOwner(): undefined {
		return undefined;
	}
	async function refresh(): Promise<void> {}
	async function track() {
		return { kind: "unsupported", reason: "feature_not_found" } as const;
	}
	const consumer = { start, stop, findOwner, refresh };
	const client = { track };
	const createKafka = spyOn(kafka, "createKafkaClient");
	const createConsumer = spyOn(
		kafka,
		"createOwnershipConsumer",
	).mockReturnValue(consumer);
	const createClient = spyOn(
		workerClient,
		"createBalanceWorkerClient",
	).mockReturnValue(client);
	// Query-isolated accessors keep private memoized fakes out of later tests.
	const ownership: typeof ownershipAccess = await import(
		new URL(
			"../../../src/external/balanceWorker/getOwnershipConsumer.ts?balance-worker-wiring",
			import.meta.url,
		).href
	);

	await ownership.startOwnershipConsumer();
	await ownership.stopOwnershipConsumer();
	expect(createKafka).not.toHaveBeenCalled();
	expect(createConsumer).not.toHaveBeenCalled();
	expect(starts).toBe(0);
	expect(stops).toBe(0);
	expect(info).toHaveBeenCalledWith(
		"[balance-worker] Ownership consumer skipped: rollout disabled",
	);

	balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({
		NODE_ENV: "development",
		BALANCE_WORKER_ROLLOUT_ENABLED: "true",
		KAFKA_BROKERS: "broker:9092",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "ownership",
		BALANCE_WORKER_PARTITION_COUNT: "4",
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: "200",
	});
	await ownership.startOwnershipConsumer();
	expect(ownership.getOwnershipConsumer()).toBe(consumer);
	expect(ownership.getOwnershipConsumer()).toBe(consumer);
	expect(createKafka).toHaveBeenCalledTimes(1);
	expect(createConsumer).toHaveBeenCalledTimes(1);
	expect(createConsumer.mock.calls[0]?.[0].config).toEqual({
		topic: "ownership",
		groupIdPrefix: "autumn-server-ownership",
	});
	expect(starts).toBe(1);
	expect(info).toHaveBeenCalledWith(
		{ brokers: ["broker:9092"], topic: "ownership" },
		"[balance-worker] Starting Kafka ownership consumer; waiting for initial catch-up",
	);
	expect(info).toHaveBeenLastCalledWith(
		expect.stringMatching(
			/Kafka ownership consumer ready; initial catch-up complete \(\d+ms\)/,
		),
	);

	spyOn(ownershipAccess, "getOwnershipConsumer").mockReturnValue(consumer);
	const access: typeof import("@/external/balanceWorker/getBalanceWorkerClient.js") =
		await import(
			new URL(
				"../../../src/external/balanceWorker/getBalanceWorkerClient.ts?balance-worker-wiring",
				import.meta.url,
			).href
		);
	expect(access.getBalanceWorkerClient()).toBe(client);
	expect(access.getBalanceWorkerClient()).toBe(client);
	expect(createClient).toHaveBeenCalledTimes(1);
	expect(createClient).toHaveBeenCalledWith({
		ctx: { owners: consumer },
		config: { partitionCount: 4, timeoutMs: 200 },
	});
	await ownership.stopOwnershipConsumer();
	expect(stops).toBe(1);
	info.mockClear();
	startupFailure = new Error("Ownership catch-up deadline exceeded");
	await expect(ownership.startOwnershipConsumer()).rejects.toBe(startupFailure);
	expect(info).toHaveBeenCalledTimes(1);
	expect(error).toHaveBeenCalledWith(
		{ error: startupFailure, durationMs: expect.any(Number) },
		"[balance-worker] Kafka ownership consumer startup failed",
	);
}

async function selectsBalanceWorkerWithoutLegacyFallback(): Promise<void> {
	const calls: string[] = [];
	let balanceWorkerFailure: Error | undefined;
	let receivedFailure: Error | undefined;
	let asyncEnabled = false;
	let queuedForReplay = false;
	const balanceWorkerResponse = {
		customer_id: "customer",
		value: 2,
		balance: null,
	} satisfies TrackResponseV3;
	const legacyResponse = {
		customer_id: "customer",
		value: 3,
		balance: null,
	} satisfies TrackResponseV3;
	async function runBalanceWorker(): Promise<TrackResponseV3> {
		calls.push("balanceWorker");
		if (balanceWorkerFailure) throw balanceWorkerFailure;
		return balanceWorkerResponse;
	}
	async function runAsync(): Promise<void> {
		calls.push("async");
	}
	async function runLegacy({
		ctx,
	}: Parameters<
		typeof legacyTrack.runTrackWithRollout
	>[0]): Promise<TrackResponseV3> {
		calls.push("legacy");
		ctx.extraLogs.trackQueuedForReplay = queuedForReplay;
		return legacyResponse;
	}
	function isAsyncEnabled(): boolean {
		calls.push("async-config");
		return asyncEnabled;
	}
	function getFeatureDeductions(): [] {
		calls.push("feature-deductions");
		return [];
	}
	spyOn(balanceWorkerTrack, "runBalanceWorkerTrack").mockImplementation(
		runBalanceWorker,
	);
	spyOn(asyncTrack, "runAsyncTrack").mockImplementation(runAsync);
	spyOn(legacyTrack, "runTrackWithRollout").mockImplementation(runLegacy);
	spyOn(
		featureDeductions,
		"getTrackFeatureDeductionsForBody",
	).mockImplementation(getFeatureDeductions);
	spyOn(asyncTrackConfig, "isAsyncTrackEnabled").mockImplementation(
		isAsyncEnabled,
	);
	const app = new Hono<HonoEnv>();
	async function attachContext(context: Context<HonoEnv>, next: Next) {
		context.set("ctx", createContext());
		await next();
	}
	function reportFailure(cause: Error, context: Context<HonoEnv>): Response {
		receivedFailure = cause;
		return context.json({ error: cause.message }, 500);
	}
	app.use("*", attachContext);
	app.onError(reportFailure);
	app.post("/track", ...handleTrack);
	async function postTrack({
		async,
	}: {
		async?: boolean;
	} = {}): Promise<Response> {
		const body = {
			customer_id: "customer",
			feature_id: "messages",
			value: 2,
			async,
		} satisfies TrackParams;
		return app.request("/track", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}
	async function expectSelectedPath({
		response,
		status,
		path,
	}: {
		response: Response;
		status: number;
		path: string[];
	}): Promise<void> {
		expect(response.status).toBe(status);
		expect(calls).toEqual(path);
		calls.length = 0;
	}

	balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({
		NODE_ENV: "development",
		BALANCE_WORKER_ROLLOUT_ENABLED: "true",
	});
	asyncEnabled = true;
	for (const async of [true, false]) {
		const response = await postTrack({ async });
		await expectSelectedPath({
			response,
			status: 200,
			path: ["balanceWorker"],
		});
		expect(await response.json()).toEqual(balanceWorkerResponse);
	}
	balanceWorkerFailure = new Error("Ambiguous balance worker write");
	await expectSelectedPath({
		response: await postTrack({ async: true }),
		status: 500,
		path: ["balanceWorker"],
	});
	expect(receivedFailure).toBe(balanceWorkerFailure);

	balanceWorkerEnv = balanceWorkerConfig.createBalanceWorkerClientEnv({});
	await expectSelectedPath({
		response: await postTrack({ async: true }),
		status: 202,
		path: ["feature-deductions", "async"],
	});
	await expectSelectedPath({
		response: await postTrack(),
		status: 202,
		path: ["feature-deductions", "async-config", "async"],
	});
	asyncEnabled = false;
	const response = await postTrack();
	await expectSelectedPath({
		response,
		status: 200,
		path: ["feature-deductions", "async-config", "legacy"],
	});
	expect(await response.json()).toEqual(legacyResponse);
	queuedForReplay = true;
	await expectSelectedPath({
		response: await postTrack(),
		status: 202,
		path: ["feature-deductions", "async-config", "legacy"],
	});
}

beforeEach(prepareBalanceWorkerConfig);
afterEach(restoreMocks);
test(
	"balance worker routing requires development and a sandbox request",
	gatesBalanceWorkerToEnabledDevelopmentSandbox,
);
test(
	"disabled boot avoids Kafka; enabled accessors memoize ownership and client",
	startsAndMemoizesOnlyWhenEnabled,
);
test(
	"track selects one path and never falls back after a balance worker failure",
	selectsBalanceWorkerWithoutLegacyFallback,
);
