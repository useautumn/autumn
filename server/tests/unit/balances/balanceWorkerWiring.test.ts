import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as workerClient from "@autumn/balance-worker-client";
import * as balanceWorkerConfig from "@autumn/env/balanceWorkerClient";
import { BALANCE_WORKER_PARTITION_COUNT } from "@autumn/env/balanceWorkerConstants";
import * as kafka from "@autumn/kafka";
import {
	ApiVersionClass,
	AppEnv,
	type CheckResponseV3,
	LATEST_VERSION,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { type Context, Hono, type Next } from "hono";
import * as rolloutAccess from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCheck } from "@/internal/api/check/handleCheck.js";
import * as balanceWorkerCheck from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import * as legacyCheck from "@/internal/balances/check/runCheckWithRollout.js";
import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";
import * as balanceWorkerTrack from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import * as asyncTrack from "@/internal/balances/track/runAsyncTrack.js";
import * as legacyTrack from "@/internal/balances/track/runTrackWithRollout.js";
import * as featureDeductions from "@/internal/balances/track/utils/getFeatureDeductions.js";
import * as asyncTrackConfig from "@/internal/misc/asyncTrack/asyncTrackStore.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

const localEnv = { KAFKA_AUTH_MODE: "none" };

// Routing is fixed on in source, so each case states the rollout it exercises.
let rolloutEnabled = false;

function createClientEnv({
	runtimeEnv = localEnv,
	rolloutEnabled: nextRolloutEnabled = false,
}: {
	runtimeEnv?: Record<string, string | undefined>;
	rolloutEnabled?: boolean;
} = {}) {
	rolloutEnabled = nextRolloutEnabled;
	return balanceWorkerConfig.createBalanceWorkerClientEnv(runtimeEnv);
}

let balanceWorkerEnv = createClientEnv();

function readBalanceWorkerClientEnv() {
	return balanceWorkerEnv;
}

function prepareBalanceWorkerConfig(): void {
	balanceWorkerEnv = createClientEnv();
	spyOn(rolloutAccess, "getBalanceWorkerRolloutEnabled").mockImplementation(
		() => rolloutEnabled,
	);
	spyOn(balanceWorkerConfig, "getBalanceWorkerClientEnv").mockImplementation(
		readBalanceWorkerClientEnv,
	);
}

function restoreMocks(): void {
	mock.restore();
}

function ignoreLog(): void {}

function refuseUnconfiguredKafka() {
	// This used to break disabled startup and legacy routes before reaching Redis.
	return spyOn(
		balanceWorkerConfig,
		"getBalanceWorkerClientEnv",
	).mockImplementation(() =>
		balanceWorkerConfig.createBalanceWorkerClientEnv({
			NODE_ENV: "production",
		}),
	);
}

function createContext({
	env = AppEnv.Sandbox,
}: {
	env?: AppEnv;
} = {}): AutumnContext {
	return {
		id: "balance-worker-wiring",
		timestamp: Date.now(),
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

function gatesBalanceWorkerOnTheRolloutFlagAlone(): void {
	for (const enabled of [true, false]) {
		balanceWorkerEnv = createClientEnv({ rolloutEnabled: enabled });
		expect(isBalanceWorkerRolloutEnabled()).toBe(enabled);
	}
}

async function startsAndMemoizesOnlyWhenEnabled(): Promise<void> {
	let starts = 0;
	let stops = 0;
	const info = spyOn(logger, "info").mockImplementation(ignoreLog);
	async function track(): Promise<never> {
		throw new Error("The wiring test never sends a command");
	}
	const queueNothing = async () => undefined;
	const client = {
		track,
		check: track,
		initialize: track,
		evict: track,
		finalize: track,
		confirmExpiredLock: track,
		enqueue: queueNothing,
		queue: { track: queueNothing },
		start: async () => {
			starts++;
		},
		stop: async () => {
			stops++;
		},
	};
	const createClient = spyOn(
		workerClient,
		"createKafkaBalanceWorkerClient",
	).mockReturnValue(client);
	// Query-isolated accessors keep private memoized fakes out of later tests.
	const access: typeof import("@/external/balanceWorker/getBalanceWorkerClient.js") =
		await import(
			new URL(
				"../../../src/external/balanceWorker/getBalanceWorkerClient.ts?balance-worker-wiring",
				import.meta.url,
			).href
		);

	const readClientConfig = refuseUnconfiguredKafka();
	await access.startBalanceWorkerClient();
	await access.stopBalanceWorkerClient();
	expect(readClientConfig).not.toHaveBeenCalled();
	expect(createClient).not.toHaveBeenCalled();
	expect(starts).toBe(0);
	expect(stops).toBe(0);
	expect(info).toHaveBeenCalledWith(
		"[balance-worker] Client skipped: rollout disabled",
	);
	readClientConfig.mockImplementation(readBalanceWorkerClientEnv);

	balanceWorkerEnv = createClientEnv({
		runtimeEnv: {
			...localEnv,
			KAFKA_BROKERS: "broker:9092",
			BALANCE_WORKER_DEPLOYMENT: "serving",
		},
		rolloutEnabled: true,
	});
	await access.startBalanceWorkerClient();
	expect(access.getBalanceWorkerClient()).toBe(client);
	expect(access.getBalanceWorkerClient()).toBe(client);
	expect(createClient).toHaveBeenCalledTimes(1);
	expect(createClient.mock.calls[0]?.[0].config).toEqual({
		kafka: {
			clientId: "autumn-server-balance-worker",
			brokers: ["broker:9092"],
			authMode: "none",
			region: undefined,
		},
		ownershipTopic: "serving-ownership",
		commandTopic: "serving-commands",
		groupIdPrefix: "autumn-server-ownership",
		partitionCount: BALANCE_WORKER_PARTITION_COUNT,
		timeoutMs: 1000,
		routeRefreshTimeoutMs: 200,
		catchUpTimeoutMs: expect.any(Number),
	});
	expect(starts).toBe(1);
	await access.stopBalanceWorkerClient();
	expect(stops).toBe(1);
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

	balanceWorkerEnv = createClientEnv({ rolloutEnabled: true });
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

	balanceWorkerEnv = createClientEnv();
	const readClientConfig = refuseUnconfiguredKafka();
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
	expect(readClientConfig).not.toHaveBeenCalled();
}

beforeEach(prepareBalanceWorkerConfig);
afterEach(restoreMocks);
test(
	"balance worker routing follows the rollout flag alone",
	gatesBalanceWorkerOnTheRolloutFlagAlone,
);
test(
	"disabled boot avoids Kafka; enabled accessors memoize ownership and client",
	startsAndMemoizesOnlyWhenEnabled,
);
test(
	"track selects one path and never falls back after a balance worker failure",
	selectsBalanceWorkerWithoutLegacyFallback,
);

test("check selects the worker without falling back or using the blanket fail-open timer", async () => {
	const calls: string[] = [];
	const response: CheckResponseV3 = {
		allowed: false,
		customer_id: "customer",
		required_balance: 1,
		balance: null,
		flag: null,
	};
	let failure: Error | undefined;
	let delay = false;
	spyOn(balanceWorkerCheck, "runBalanceWorkerCheck").mockImplementation(
		async () => {
			calls.push("worker");
			if (failure) throw failure;
			if (delay)
				await new Promise<void>((resolve) => setTimeout(resolve, 3_050));
			return response;
		},
	);
	spyOn(legacyCheck, "runCheckWithRollout").mockImplementation(async () => {
		calls.push("legacy");
		return { response, checkData: null };
	});
	const app = new Hono<HonoEnv>();
	app.use("*", async (context, next) => {
		context.set("ctx", createContext());
		await next();
	});
	app.onError((cause, context) => context.json({ error: cause.message }, 500));
	app.post("/check", ...handleCheck);
	const post = () =>
		app.request("/check", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ customer_id: "customer", feature_id: "messages" }),
		});
	const readClientConfig = refuseUnconfiguredKafka();
	expect((await post()).status).toBe(202);
	expect(calls).toEqual(["legacy"]);
	expect(readClientConfig).not.toHaveBeenCalled();
	readClientConfig.mockImplementation(readBalanceWorkerClientEnv);
	calls.length = 0;
	balanceWorkerEnv = createClientEnv({ rolloutEnabled: true });
	const checked = await post();
	expect(checked.status).toBe(200);
	expect(await checked.json()).toEqual(response);
	expect(calls).toEqual(["worker"]);
	calls.length = 0;
	failure = new Error("owner unavailable");
	expect((await post()).status).toBe(500);
	expect(calls).toEqual(["worker"]);
	failure = undefined;
	delay = true;
	expect((await post()).status).toBe(200);
});
