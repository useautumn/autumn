import { describe, expect, test } from "bun:test";
import { createCustomerEntitlement, occurredAt } from "../engineFixtures.js";
import { balancesAfter, deductFrom } from "./deductionFixtures.js";

describe("rollovers", () => {
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

	test.concurrent(
		"an expired rollover never funds a draw, however long the state has held it",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				rollovers: [
					{
						id: "ro_expired",
						cus_ent_id: "messages_monthly",
						balance: 10,
						usage: 0,
						expires_at: occurredAt - 1,
					},
					{
						id: "ro_live",
						cus_ent_id: "messages_monthly",
						balance: 2,
						usage: 0,
						expires_at: occurredAt + 1,
					},
				],
				value: 5,
			});

			expect(
				outcome.deltas.map((delta) => [
					delta.table,
					delta.id,
					delta.balanceDelta,
				]),
			).toEqual([
				["rollovers", "ro_live", -2],
				["customerEntitlements", "messages_monthly", -3],
			]);
		},
	);

	test.concurrent("a rollover drawn below zero funds nothing", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			rollovers: [
				{
					id: "ro_negative",
					cus_ent_id: "messages_monthly",
					balance: -5,
					usage: 0,
					expires_at: null,
				},
			],
			value: 4,
		});

		expect(
			outcome.deltas.map((delta) => [delta.table, delta.balanceDelta]),
		).toEqual([["customerEntitlements", -4]]);
	});
});
