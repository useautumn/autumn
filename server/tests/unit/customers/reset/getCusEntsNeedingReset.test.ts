import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	CusProductStatus,
	EntInterval,
	type FullCustomer,
	type FullCustomerPrice,
	type FullProduct,
	PriceType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { getCusEntsNeedingReset } from "@/internal/customers/actions/resetCustomerEntitlements/getCusEntsNeedingReset.js";

const FEATURE_ID = "messages";
const NOW = 1_700_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 60_000;
const CUS_PROD_ID = "cus_prod_test";
const PRODUCT_ID = "prod_test";

const buildFullCustomer = ({
	productStatus,
	ignorePastDue,
	nextResetAt,
	withMatchingPrice = false,
	withSeparateIntervalPrice = false,
}: {
	productStatus: CusProductStatus;
	ignorePastDue: boolean;
	nextResetAt: number | null;
	withMatchingPrice?: boolean;
	withSeparateIntervalPrice?: boolean;
}): FullCustomer => {
	const cusEnt = customerEntitlements.create({
		featureId: FEATURE_ID,
		featureName: "Messages",
		allowance: 100,
		balance: 50,
		nextResetAt,
		customerProductId: CUS_PROD_ID,
		interval: withSeparateIntervalPrice ? EntInterval.Month : null,
	});

	const customerPrices: FullCustomerPrice[] = withMatchingPrice
		? [
				{
					id: "cus_price_test",
					internal_customer_id: "cus_internal",
					customer_product_id: CUS_PROD_ID,
					created_at: Date.now(),
					price_id: "price_test",
					price: {
						entitlement_id: cusEnt.entitlement.id,
						config: {
							type: PriceType.Usage,
							bill_when: withSeparateIntervalPrice
								? BillWhen.InAdvance
								: BillWhen.EndOfPeriod,
							billing_units: null,
							internal_feature_id: cusEnt.internal_feature_id,
							feature_id: cusEnt.feature_id,
							usage_tiers: [{ to: -1, amount: 1 }],
							interval: withSeparateIntervalPrice
								? BillingInterval.Year
								: BillingInterval.Month,
							interval_count: 1,
						},
					} as FullCustomerPrice["price"],
				},
			]
		: [];

	const baseProduct = products.createFull({ id: PRODUCT_ID });
	const product: FullProduct = {
		...baseProduct,
		config: { ...baseProduct.config, ignore_past_due: ignorePastDue },
	};

	const cusProduct = customerProducts.create({
		id: CUS_PROD_ID,
		productId: PRODUCT_ID,
		customerEntitlements: [cusEnt],
		customerPrices,
		status: productStatus,
		product,
	});

	return customers.create({
		customerProducts: [
			{
				...cusProduct,
				customer_entitlements: cusProduct.customer_entitlements.map(
					(customerEntitlement) => ({
						...customerEntitlement,
						separate_interval: withSeparateIntervalPrice,
					}),
				),
			},
		],
	});
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
		expect(
			result[0].customer_product?.product?.config?.ignore_past_due,
		).toBe(true);
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

	test("returns separate-interval prepaid cusEnt when a matching cusPrice exists", () => {
		const fullCus = buildFullCustomer({
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
			nextResetAt: PAST,
			withMatchingPrice: true,
			withSeparateIntervalPrice: true,
		});

		const result = getCusEntsNeedingReset({ fullCus, now: NOW });

		expect(result).toHaveLength(1);
		expect(result[0].separate_interval).toBe(true);
	});
});
