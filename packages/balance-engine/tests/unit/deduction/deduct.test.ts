import { describe, expect, test } from "bun:test";
import type { WorkerCustomerEntitlement } from "../../../src/balanceEngine.js";
import { createSubjectState } from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
} from "../engineFixtures.js";

const deductFrom = ({
	customerEntitlements,
	rollovers = [],
	value,
	overageBehavior = "cap",
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	rollovers?: {
		id: string;
		cus_ent_id: string;
		balance: number;
		usage: number;
		expires_at: number | null;
	}[];
	value: number;
	overageBehavior?: "cap" | "reject" | "overflow";
}) =>
	deduct({
		fullSubject: createSubjectFor({
			state: createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements,
				rollovers,
			}),
		}),
		featureId: "messages",
		overageBehavior,
		now: occurredAt,
		value,
	});

const balancesAfter = (outcome: ReturnType<typeof deduct>) =>
	outcome.changes.map((change) =>
		change.op === "update" ? [change.id, change.after] : change,
	);

describe("deduct", () => {
	test.concurrent("takes from one row and stops at zero under cap", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
		});

		expect(outcome).toMatchObject({
			appliedValue: 3,
			remaining: 2,
			rejected: false,
		});
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: 0 }],
		]);
	});

	test.concurrent("refuses the whole value under reject", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
			overageBehavior: "reject",
		});

		expect(outcome).toMatchObject({
			appliedValue: 3,
			remaining: 2,
			rejected: true,
			changes: [],
		});
	});

	test.concurrent("drives a row negative under overflow", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
			overageBehavior: "overflow",
		});

		expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: -2 }],
		]);
	});

	test.concurrent("drains rows in order, included before overage", () => {
		const outcome = deductFrom({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ id: "free", balance: 10 }),
					created_at: occurredAt,
				},
				{
					...createCustomerEntitlement({ id: "paid", balance: 5 }),
					created_at: occurredAt + 1,
					usage_allowed: true,
				},
			],
			value: 30,
		});

		expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
		expect(
			outcome.deltas.map((delta) => [delta.id, delta.balanceDelta]),
		).toEqual([
			["free", -10],
			["paid", -5],
			["paid", -15],
		]);
		expect(balancesAfter(outcome)).toEqual([
			["free", { balance: 0 }],
			["paid", { balance: -15 }],
		]);
	});

	test.concurrent(
		"an unlimited row absorbs everything and siblings stay untouched",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "finite", balance: 10 }),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "infinite", balance: 0 }),
						created_at: occurredAt + 1,
						unlimited: true,
					},
				],
				value: 30,
			});

			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([["infinite", { balance: -30 }]]);
		},
	);

	test.concurrent(
		"a refund lifts an overdrawn row to zero, then rows in order up to their grant",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "a", balance: -4 }),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "b", balance: 998 }),
						created_at: occurredAt + 1,
					},
				],
				value: -10,
			});

			expect(outcome).toMatchObject({
				appliedValue: -10,
				remaining: 0,
				rejected: false,
			});
			expect(
				outcome.deltas.map((delta) => [delta.id, delta.balanceDelta]),
			).toEqual([
				["a", 4],
				["a", 6],
			]);
			expect(balancesAfter(outcome)).toEqual([["a", { balance: 6 }]]);
		},
	);

	test.concurrent(
		"rollovers drain first, soonest expiry first, and count usage",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createCustomerEntitlement({ balance: 100 })],
				rollovers: [
					{
						id: "ro_late",
						cus_ent_id: "messages_monthly",
						balance: 20,
						usage: 0,
						expires_at: occurredAt + 2000,
					},
					{
						id: "ro_soon",
						cus_ent_id: "messages_monthly",
						balance: 5,
						usage: 0,
						expires_at: occurredAt + 1000,
					},
				],
				value: 30,
			});

			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 95 }],
				["ro_soon", { balance: 0, usage: 5 }],
				["ro_late", { balance: 0, usage: 20 }],
			]);
			expect(outcome.deltas.map((delta) => delta.id)).toEqual([
				"ro_soon",
				"ro_late",
				"messages_monthly",
			]);
		},
	);
});
