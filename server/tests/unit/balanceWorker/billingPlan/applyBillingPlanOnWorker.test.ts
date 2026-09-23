import { describe, expect, test } from "bun:test";
import type { ApplyBillingPlanRequest } from "@autumn/balance-engine";
import {
	type ApplyBillingPlanReply,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { isBalanceWorkerStaleSubjectError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { applyBillingPlanOnWorker } from "@/internal/balanceWorker/billingPlan/applyBillingPlanOnWorker.js";
import {
	createCustomerPlan,
	defaultProduct,
	linkBackPlan,
	newCustomer,
} from "./billingPlanFixtures.js";

const ctx = {
	...contexts.create({}),
	id: "req_plan",
	timestamp: 1_700_000_000_000,
};

const replyFor = ({
	status,
	internalCustomerId = newCustomer.internal_id,
}: {
	status: ApplyBillingPlanReply["result"]["status"];
	internalCustomerId?: string;
}): ApplyBillingPlanReply =>
	({
		result: { status },
		state: { customer: { internal_id: internalCustomerId } },
		catalog: {},
	}) as unknown as ApplyBillingPlanReply;

const timedOut = () =>
	new BalanceWorkerClientError({
		code: "DEADLINE",
		outcome: "unknown",
		message: "timed out after the send",
	});

const staleSubject = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "stale",
		workerCode: "STALE_SUBJECT",
	});

/** Answers each send in turn and records the command ids it was sent. */
const scriptedClient = (answers: (() => ApplyBillingPlanReply)[]) => {
	const commandIds: string[] = [];
	return {
		commandIds,
		applyBillingPlan: async ({
			request,
		}: {
			request: ApplyBillingPlanRequest;
		}) => {
			commandIds.push(request.command.commandId);
			const answer = answers[commandIds.length - 1];
			if (!answer) throw new Error("sent more times than scripted");
			return answer();
		},
	};
};

const send = ({
	autumnBillingPlan,
	client,
}: {
	autumnBillingPlan: ReturnType<typeof createCustomerPlan>;
	client: ReturnType<typeof scriptedClient>;
}) =>
	applyBillingPlanOnWorker({
		ctx,
		customerId: "cus_test",
		autumnBillingPlan,
		client,
	});

describe("applyBillingPlanOnWorker", () => {
	test("an unknown outcome is sent once more as a new command", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			() => replyFor({ status: "applied" }),
		]);
		const result = await send({ autumnBillingPlan: linkBackPlan(), client });
		expect(result.status).toBe("applied");
		expect(client.commandIds).toHaveLength(2);
		expect(new Set(client.commandIds).size).toBe(2);
	});

	test("an update refused as stale is sent once more; stale twice surfaces for the Postgres fallback", async () => {
		const recovered = scriptedClient([
			() => {
				throw staleSubject();
			},
			() => replyFor({ status: "applied" }),
		]);
		expect(
			(await send({ autumnBillingPlan: linkBackPlan(), client: recovered }))
				.status,
		).toBe("applied");

		const stillBehind = scriptedClient([
			() => {
				throw staleSubject();
			},
			() => {
				throw staleSubject();
			},
		]);
		const error = await send({
			autumnBillingPlan: linkBackPlan(),
			client: stillBehind,
		}).catch((cause: unknown) => cause);
		expect(isBalanceWorkerStaleSubjectError(error)).toBe(true);
	});

	test("a create refused as stale collided with an existing customer, and is not resent", async () => {
		const client = scriptedClient([
			() => {
				throw staleSubject();
			},
		]);
		expect(
			await send({ autumnBillingPlan: createCustomerPlan(), client }),
		).toEqual({ status: "customer_exists" });
		expect(client.commandIds).toHaveLength(1);
	});

	test("a resent create that finds its own customer was applied by the first attempt", async () => {
		const client = scriptedClient([
			() => {
				throw timedOut();
			},
			() => replyFor({ status: "customer_exists" }),
		]);
		expect(
			await send({ autumnBillingPlan: createCustomerPlan(), client }),
		).toEqual({
			status: "applied",
			internalCustomerId: newCustomer.internal_id,
		});
	});

	test("the command names every entity whose rows the plan writes, once", async () => {
		const sent: ApplyBillingPlanRequest[] = [];
		const onEntity = {
			...defaultProduct(),
			internal_entity_id: "ent_internal_1",
			entity_id: "ent_1",
		};
		await applyBillingPlanOnWorker({
			ctx,
			customerId: "cus_test",
			autumnBillingPlan: {
				...linkBackPlan(),
				updateCustomerProducts: [
					{
						customerProduct: onEntity,
						updates: { subscription_ids: ["sub_1"] },
					},
					{
						customerProduct: { ...onEntity, id: "cus_prod_second" },
						updates: { subscription_ids: ["sub_1"] },
					},
				],
			},
			client: {
				applyBillingPlan: async ({ request }) => {
					sent.push(request);
					return replyFor({ status: "applied" });
				},
			},
		});
		expect(sent[0]?.command.entityIds).toEqual(["ent_1"]);
	});

	test("a create that finds someone else's customer reports it, with that customer's internal id", async () => {
		const client = scriptedClient([
			() =>
				replyFor({
					status: "customer_exists",
					internalCustomerId: "cus_internal_winner",
				}),
		]);
		expect(
			await send({ autumnBillingPlan: createCustomerPlan(), client }),
		).toEqual({
			status: "customer_exists",
			internalCustomerId: "cus_internal_winner",
		});
	});
});
