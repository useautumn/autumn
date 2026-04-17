import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCustomer,
	type FullCustomerPrice,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import chalk from "chalk";
import { getCusEntsNeedingReset } from "@/internal/customers/actions/resetCustomerEntitlements/getCusEntsNeedingReset.js";

const FEATURE_ID = "messages";
const NOW = 1_700_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 60_000;
const CUS_PROD_ID = "cus_prod_test";

const buildFullCustomer = ({
	productStatus,
	ignorePastDue,
	nextResetAt,
	withMatchingPrice = false,
}: {
	productStatus: CusProductStatus;
	ignorePastDue: boolean;
	nextResetAt: number | null;
	withMatchingPrice?: boolean;
}): FullCustomer => {
	const cusEnt = customerEntitlements.create({
		featureId: FEATURE_ID,
		featureName: "Messages",
		allowance: 100,
		balance: 50,
		nextResetAt,
		customerProductId: CUS_PROD_ID,
	});

	const customerPrices: FullCustomerPrice[] = withMatchingPrice
		? [
				{
					id: "cus_price_test",
					internal_customer_id: "cus_internal",
					customer_product_id: CUS_PROD_ID,
					created_at: Date.now(),
					price_id: "price_test",
					// The price's entitlement_id must match the cusEnt.entitlement.id
					// for cusEntToCusPrice() to resolve a truthy match.
					price: {
						entitlement_id: cusEnt.entitlement.id,
					} as FullCustomerPrice["price"],
				},
			]
		: [];

	const cusProduct = customerProducts.create({
		id: CUS_PROD_ID,
		customerEntitlements: [cusEnt],
		customerPrices,
		status: productStatus,
	});

	const fullCus = customers.create({
		customerProducts: [cusProduct],
	});

	// The shared fixture omits `ignore_past_due`; splice it in so the function
	// under test sees the flag we actually want to exercise.
	return {
		...fullCus,
		ignore_past_due: ignorePastDue,
	} as FullCustomer;
};

describe(chalk.yellowBright("getCusEntsNeedingReset"), () => {
	test("returns cusEnt when product is Active and ignore_past_due is false", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
			nextResetAt: PAST,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(1);
		expect(result[0].feature_id).toBe(FEATURE_ID);
		expect(result[0].customer_product?.status).toBe(CusProductStatus.Active);
	});

	test("skips cusEnt when product is PastDue and ignore_past_due is false", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: false,
			nextResetAt: PAST,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(0);
	});

	test("returns cusEnt when product is PastDue and ignore_past_due is true", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: true,
			nextResetAt: PAST,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(1);
		expect(result[0].customer_product?.status).toBe(CusProductStatus.PastDue);
	});

	test("skips cusEnt when product is Expired even with ignore_past_due true", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.Expired,
			ignorePastDue: true,
			nextResetAt: PAST,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(0);
	});

	test("skips cusEnt when next_reset_at is in the future", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
			nextResetAt: FUTURE,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(0);
	});

	test("skips cusEnt when a matching cusPrice exists (paid/metered entitlement)", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
			nextResetAt: PAST,
			withMatchingPrice: true,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(0);
	});
});
