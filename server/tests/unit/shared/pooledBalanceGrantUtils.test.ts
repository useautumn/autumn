import { expect, test } from "bun:test";
import {
	cusEntsToAllowance,
	cusEntsToMaxPurchase,
	cusEntToIncludedUsage,
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	getMaxOverage,
} from "@autumn/shared";

const pooledCustomerEntitlement = {
	id: "cus_ent_pool",
	balance: 1000,
	additional_balance: 0,
	adjustment: 0,
	entities: null,
	usage_allowed: true,
	replaceables: [],
	rollovers: [],
	customer_product: null,
	entitlement: {
		allowance: 0,
		allowance_type: "fixed",
		usage_limit: 1300,
		entity_feature_id: null,
		feature: { id: "messages" },
		rollover: { max: null, length: 1, duration: "month" },
	},
	pooled_balance: { granted: 1000 },
} as unknown as FullCusEntWithFullCusProduct;

test("pooled balance grant utilities use pooled_balance.granted", () => {
	expect(cusEntToStartingBalance({ cusEnt: pooledCustomerEntitlement })).toBe(
		1000,
	);
	expect(cusEntsToAllowance({ cusEnts: [pooledCustomerEntitlement] })).toBe(
		1000,
	);
	expect(cusEntToIncludedUsage({ cusEnt: pooledCustomerEntitlement })).toBe(
		1000,
	);
	expect(getMaxOverage({ cusEnt: pooledCustomerEntitlement })).toBe(300);
	expect(cusEntsToMaxPurchase({ cusEnts: [pooledCustomerEntitlement] })).toBe(
		300,
	);
});

test("pooled included usage adds rollover grant when requested", () => {
	const cusEntWithRollover = {
		...pooledCustomerEntitlement,
		rollovers: [{ balance: 200, usage: 50 }],
	} as FullCusEntWithFullCusProduct;

	expect(
		cusEntToIncludedUsage({
			cusEnt: cusEntWithRollover,
			withRollovers: true,
		}),
	).toBe(1250);
	expect(cusEntToIncludedUsage({ cusEnt: cusEntWithRollover })).toBe(1000);
});
