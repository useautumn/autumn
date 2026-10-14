import { describe, expect, test } from "bun:test";
import type { ApplyBillingPlanRequest } from "@autumn/balance-engine";
import { toBillingPlanDeleteOp } from "@autumn/balance-engine";
import {
	type ApplyBillingPlanReply,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { applyCustomerRowsOnWorker } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/applyCustomerRowsOnWorker.js";

const ctx = {
	...contexts.create({}),
	id: "req_migration",
	timestamp: 1_700_000_000_000,
};

const customer = {
	internalId: "cus_internal_1",
	id: "customer_1",
	name: null,
	email: null,
};

const applied = (): ApplyBillingPlanReply =>
	({
		result: { status: "applied" },
		state: { customer: { internal_id: "cus_internal_1" } },
		catalog: {},
	}) as unknown as ApplyBillingPlanReply;

const stale = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "stale",
		workerCode: "STALE_SUBJECT",
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

const toPlan = ({ rows }: { rows: string[] }) => ({
	entityIds: [],
	ops: rows.map((id) =>
		toBillingPlanDeleteOp({ table: "customerEntitlements", id }),
	),
	catalogRows: [],
});

const run = ({
	client,
	reselect = async () => ["grant_fresh"],
}: {
	client: ReturnType<typeof scriptedClient>;
	reselect?: () => Promise<string[]>;
}) =>
	applyCustomerRowsOnWorker({
		ctx,
		customer,
		rows: ["grant_selected"],
		toPlan,
		reselect,
		client,
	});

const sentGrantIds = (client: ReturnType<typeof scriptedClient>) =>
	client.requests.map(({ command }) =>
		command.ops.map((op) => ("id" in op ? op.id : null)),
	);

describe("applyCustomerRowsOnWorker", () => {
	test("applied on the first send reports the selected rows", async () => {
		const client = scriptedClient([applied]);
		expect(await run({ client })).toEqual({
			status: "applied",
			rows: ["grant_selected"],
		});
	});

	test("stale re-selects once and sends the fresh rows under a new command id", async () => {
		const client = scriptedClient([
			() => {
				throw stale();
			},
			applied,
		]);
		expect(await run({ client })).toEqual({
			status: "applied",
			rows: ["grant_fresh"],
		});
		const [firstId, secondId] = client.requests.map(
			({ command }) => command.commandId,
		);
		expect(firstId).not.toBe(secondId);
		expect(sentGrantIds(client)).toEqual([["grant_selected"], ["grant_fresh"]]);
	});

	test("a re-select that finds nothing left to change is applied with no rows", async () => {
		const client = scriptedClient([
			() => {
				throw stale();
			},
		]);
		expect(await run({ client, reselect: async () => [] })).toEqual({
			status: "applied",
			rows: [],
		});
		expect(client.requests).toHaveLength(1);
	});

	test("stale twice sends the customer to the SQL path", async () => {
		const client = scriptedClient([
			() => {
				throw stale();
			},
			() => {
				throw stale();
			},
		]);
		expect(await run({ client })).toEqual({
			status: "fallback",
			reason: "STALE_SUBJECT",
		});
	});

	test("an unreachable worker fails the customer with the client's code", async () => {
		const client = scriptedClient([
			() => {
				throw unreachable();
			},
		]);
		expect(await run({ client })).toEqual({
			status: "failed",
			reason: "TRANSPORT",
			unavailable: true,
		});
	});

	test("an error that isn't the worker's is thrown, so the page fails", async () => {
		const client = scriptedClient([
			() => {
				throw stale();
			},
		]);
		const error = await run({
			client,
			reselect: async () => {
				throw new Error("Postgres went away");
			},
		}).catch((cause: unknown) => cause);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("Postgres went away");
	});
});
