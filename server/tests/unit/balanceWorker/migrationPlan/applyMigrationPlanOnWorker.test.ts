import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanRequest,
	toBillingPlanDeleteOp,
} from "@autumn/balance-engine";
import {
	type ApplyBillingPlanReply,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { applyMigrationPlanOnWorker } from "@/internal/balanceWorker/migrationPlan/applyMigrationPlanOnWorker.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";

const ctx = {
	...contexts.create({}),
	id: "req_migration",
	timestamp: 1_700_000_000_000,
};

const applied = (): ApplyBillingPlanReply =>
	({
		result: { status: "applied" },
		state: { customer: { internal_id: "cus_internal_1" } },
		catalog: {},
	}) as unknown as ApplyBillingPlanReply;

const timedOut = () =>
	new BalanceWorkerClientError({
		code: "DEADLINE",
		outcome: "unknown",
		message: "timed out after the send",
	});

const workerError = (workerCode: "DUPLICATE_COMMAND" | "STALE_SUBJECT") =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: workerCode,
		workerCode,
	});

const unreachable = () =>
	new BalanceWorkerClientError({
		code: "TRANSPORT",
		outcome: "not_submitted",
		message: "connection refused",
	});

const scriptedClient = (answers: (() => ApplyBillingPlanReply)[]) => {
	const requests: ApplyBillingPlanRequest[] = [];
	return {
		requests,
		applyBillingPlan: async ({
			request,
		}: {
			request: ApplyBillingPlanRequest;
		}) => {
			requests.push(request);
			const answer = answers[requests.length - 1];
			if (!answer) throw new Error("sent more times than scripted");
			return answer();
		},
	};
};

const plan: WorkerMigrationPlan = {
	entityIds: ["ent_1"],
	ops: [
		toBillingPlanDeleteOp({
			table: "customerEntitlements",
			id: "cus_ent_1",
			expect: { entitlement_id: "ent_100" },
			withoutRollovers: true,
		}),
	],
	catalogRows: [],
};

const send = ({ client }: { client: ReturnType<typeof scriptedClient> }) =>
	applyMigrationPlanOnWorker({
		ctx,
		customerId: "cus_1",
		plan,
		commandId: "mrun_1_0_cus_internal_1",
		client,
	});

describe("applyMigrationPlanOnWorker", () => {
	test("sends the plan's ops, entities and catalog rows under the given command id", async () => {
		const client = scriptedClient([applied]);
		expect(await send({ client })).toBe("applied");

		const [request] = client.requests;
		expect(request.command.commandId).toBe("mrun_1_0_cus_internal_1");
		expect(request.command.identity).toMatchObject({
			customerId: "cus_1",
			entityId: null,
		});
		expect(request.command.entityIds).toEqual(["ent_1"]);
		expect(request.command.ops).toEqual(plan.ops);
		expect(request.catalogRows).toEqual(plan.catalogRows);
	});

	test("an unknown outcome is sent once more under the same id", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			applied,
		]);
		expect(await send({ client })).toBe("applied");
		expect(client.requests.map(({ command }) => command.commandId)).toEqual([
			"mrun_1_0_cus_internal_1",
			"mrun_1_0_cus_internal_1",
		]);
	});

	test("an unknown outcome on a fenced page is not sent again, and the request carries the page's signal", async () => {
		const controller = new AbortController();
		const signals: (AbortSignal | undefined)[] = [];
		const client = {
			applyBillingPlan: async ({ signal }: { signal?: AbortSignal }) => {
				signals.push(signal);
				controller.abort(new Error("page stalled"));
				throw timedOut();
			},
		};
		const error = await applyMigrationPlanOnWorker({
			ctx,
			customerId: "cus_1",
			plan,
			commandId: "mrun_1_0_cus_internal_1",
			signal: controller.signal,
			client: client as unknown as ReturnType<typeof scriptedClient>,
		}).catch((cause: unknown) => cause);
		expect((error as Error).message).toBe("page stalled");
		expect(signals).toEqual([controller.signal]);
	});

	test("a command the worker already holds landed earlier: applied", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			() => {
				throw workerError("DUPLICATE_COMMAND");
			},
		]);
		expect(await send({ client })).toBe("applied");
	});

	test("a resend after an unknown outcome that comes back stale is stale: refused ids are never remembered", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			() => {
				throw workerError("STALE_SUBJECT");
			},
		]);
		expect(await send({ client })).toBe("stale");
	});

	test("a resend after an unknown outcome that the worker refuses for another reason rethrows the unknown outcome", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			() => {
				throw unreachable();
			},
		]);
		const error = await send({ client }).catch((cause: unknown) => cause);
		expect((error as BalanceWorkerClientError).outcome).toBe("unknown");
	});

	test("a stale copy is reported, not resent: the ops were selected from rows the worker no longer holds", async () => {
		const client = scriptedClient([
			() => {
				throw workerError("STALE_SUBJECT");
			},
		]);
		expect(await send({ client })).toBe("stale");
		expect(client.requests).toHaveLength(1);
	});

	test("an unreachable worker throws: the caller fails the item", async () => {
		const client = scriptedClient([
			() => {
				throw unreachable();
			},
		]);
		const error = await send({ client }).catch((cause: unknown) => cause);
		expect(error).toBeInstanceOf(BalanceWorkerClientError);
	});
});
