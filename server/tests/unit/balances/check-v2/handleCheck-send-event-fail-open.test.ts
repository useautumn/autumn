import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
	ApiVersionClass,
	AppEnv,
	FeatureType,
	LATEST_VERSION,
	RecaseError,
} from "@autumn/shared";
import { Hono } from "hono";
import * as balanceWorkerClient from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCheck } from "@/internal/api/check/handleCheck.js";
import * as balanceWorkerCheck from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import * as legacyCheck from "@/internal/balances/check/runCheckWithRollout.js";
import * as queueTrackModule from "@/internal/balances/track/utils/queueTrack.js";
import * as rollout from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

const ignoreLog = () => undefined;

const createContext = (): AutumnContext =>
	({
		id: "req_check_send_event",
		timestamp: Date.now(),
		org: { id: "org_check", slug: "org-check", config: {} },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [
			{ id: "messages", internal_id: "fe_messages", type: FeatureType.Metered },
		],
		extraLogs: {},
		scopes: [],
		logger: {
			warn: ignoreLog,
			info: ignoreLog,
			error: ignoreLog,
			debug: ignoreLog,
		},
	}) as never;

const createApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (context, next) => {
		context.set("ctx", createContext());
		await next();
	});
	app.onError((cause, context) =>
		context.json(
			{ error: cause.message },
			cause instanceof RecaseError ? (cause.statusCode as 503) : 500,
		),
	);
	app.post("/check", ...handleCheck);
	return app;
};

const postCheck = (app: Hono<HonoEnv>) =>
	app.request("/check", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			customer_id: "customer",
			feature_id: "messages",
			required_balance: 2,
			send_event: true,
		}),
	});

afterEach(() => {
	mock.restore();
});

test("legacy: a send_event check past the route timeout queues its deduction under the request id", async () => {
	spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
		() => false,
	);
	spyOn(legacyCheck, "runCheckWithRollout").mockImplementation(
		() => new Promise(() => undefined),
	);
	const queued: Record<string, unknown>[] = [];
	spyOn(queueTrackModule, "queueTrack").mockImplementation(async (args) => {
		queued.push(args as never);
		return { balance: null } as never;
	});

	const response = await postCheck(createApp());

	expect(response.status).toBe(202);
	expect(await response.json()).toMatchObject({ allowed: true });
	expect(queued).toHaveLength(1);
	expect(queued[0]).toMatchObject({
		ctx: { id: "req_check_send_event" },
		body: {
			customer_id: "customer",
			feature_id: "messages",
			value: 2,
			overage_behavior: "reject",
		},
	});
}, 10_000);

test("worker: a send_event check that fails open queues the check's own command", async () => {
	spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
		() => true,
	);
	spyOn(balanceWorkerCheck, "runBalanceWorkerCheck").mockImplementation(
		async () => {
			throw new RecaseError({
				code: "balance_worker_unavailable",
				statusCode: 503,
				message: "owner unavailable",
			});
		},
	);
	const commands: Record<string, unknown>[][] = [];
	spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockImplementation(
		() =>
			({
				queue: {
					track: async ({
						commands: queuedCommands,
					}: {
						commands: Record<string, unknown>[];
					}) => {
						commands.push(queuedCommands);
					},
				},
			}) as never,
	);

	const response = await postCheck(createApp());

	expect(response.status).toBe(202);
	expect(await response.json()).toMatchObject({ allowed: true });
	expect(commands).toHaveLength(1);
	expect(commands[0]).toHaveLength(1);
	expect(commands[0][0]).toMatchObject({
		type: "track",
		// The id the check itself sent, so the worker refuses a replay of a command it already applied.
		commandId: "req_check_send_event",
		featureId: "messages",
		value: 2,
		overageBehavior: "reject",
		enforceOverdueBlock: true,
	});
});

test("worker: a send_event check whose deduction can't be queued answers 503, not an unrecorded allow", async () => {
	spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
		() => true,
	);
	spyOn(balanceWorkerCheck, "runBalanceWorkerCheck").mockImplementation(
		async () => {
			throw new RecaseError({
				code: "balance_worker_unavailable",
				statusCode: 503,
				message: "owner unavailable",
			});
		},
	);
	spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockImplementation(
		() =>
			({
				queue: {
					track: async () => {
						throw new RecaseError({
							code: "balance_worker_unavailable",
							statusCode: 503,
							message: "command log unavailable",
						});
					},
				},
			}) as never,
	);

	const response = await postCheck(createApp());

	expect(response.status).toBe(503);
});
