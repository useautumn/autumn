import { expect, test } from "bun:test";
import {
	type FullCusEntWithProduct,
	type Rollover,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { performMaximumClearing } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";

const customerEntitlement = {
	entitlement: {
		allowance: 0,
		rollover: {
			max_percentage: 50,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	},
	customer_product: null,
} as unknown as FullCusEntWithProduct;

const rollover: Rollover = {
	id: "roll_pool",
	cus_ent_id: "cus_ent_pool",
	balance: 300,
	usage: 0,
	expires_at: null,
	entities: {},
};

test("max_percentage can use a contribution-backed starting balance", () => {
	const result = performMaximumClearing({
		rows: [rollover],
		cusEnt: customerEntitlement,
		startingBalanceOverride: 500,
	});

	expect(result).toEqual({
		toDelete: [],
		toUpdate: [{ ...rollover, balance: 250 }],
	});
});
