import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	type FullProduct,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { getResettableCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/getResettableCustomerEntitlements.js";

const FEATURE_ID = "messages";
const NOW = 1_700_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 60_000;
const CUS_PROD_ID = "cus_prod_test";
const PRODUCT_ID = "prod_test";

const buildCusEnt = ({
	productStatus,
	ignorePastDue = false,
	nextResetAt,
	withMatchingPrice = false,
	withCustomerProduct = true,
}: {
	productStatus?: CusProductStatus;
	ignorePastDue?: boolean;
	nextResetAt: number | null;
	withMatchingPrice?: boolean;
	withCustomerProduct?: boolean;
}): FullCusEntWithFullCusProduct => {
	const cusEnt = customerEntitlements.create({
		featureId: FEATURE_ID,
		featureName: "Messages",
		allowance: 100,
		balance: 50,
		nextResetAt,
		customerProductId: withCustomerProduct ? CUS_PROD_ID : undefined,
	});

	if (!withCustomerProduct) {
		return {
			...cusEnt,
			customer_product_id: null,
			customer_product: null,
		};
	}

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

	return {
		...cusEnt,
		customer_product: cusProduct,
	};
};

describe(chalk.yellowBright("getResettableCustomerEntitlements"), () => {
	test("returns active cusEnt when ignore_past_due is false", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.Active,
				ignorePastDue: false,
				nextResetAt: PAST,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(1);
		expect(result[0].feature_id).toBe(FEATURE_ID);
		expect(result[0].customer_product?.status).toBe(CusProductStatus.Active);
	});

	test("skips past-due cusEnt when ignore_past_due is false", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.PastDue,
				ignorePastDue: false,
				nextResetAt: PAST,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(0);
	});

	test("returns past-due cusEnt when ignore_past_due is true", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.PastDue,
				ignorePastDue: true,
				nextResetAt: PAST,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(1);
		expect(result[0].customer_product?.status).toBe(CusProductStatus.PastDue);
		expect(
			result[0].customer_product?.product?.config?.ignore_past_due,
		).toBe(true);
	});

	test("only gates past-due status and leaves other upstream statuses to the caller", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.Active,
				nextResetAt: PAST,
			}),
			buildCusEnt({
				productStatus: CusProductStatus.PastDue,
				ignorePastDue: false,
				nextResetAt: PAST,
			}),
			buildCusEnt({
				productStatus: CusProductStatus.Expired,
				nextResetAt: PAST,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(2);
		expect(result.map((cusEnt) => cusEnt.customer_product?.status)).toEqual([
			CusProductStatus.Active,
			CusProductStatus.Expired,
		]);
	});

	test("skips cusEnt when next_reset_at is in the future", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.Active,
				nextResetAt: FUTURE,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(0);
	});

	test("skips cusEnt when next_reset_at is null", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.Active,
				nextResetAt: null,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(0);
	});

	test("skips cusEnt when a matching cusPrice exists", () => {
		const customerEntitlements = [
			buildCusEnt({
				productStatus: CusProductStatus.Active,
				nextResetAt: PAST,
				withMatchingPrice: true,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(0);
	});

	test("returns overdue extra customer entitlements without a customer_product", () => {
		const customerEntitlements = [
			buildCusEnt({
				nextResetAt: PAST,
				withCustomerProduct: false,
			}),
		];

		const result = getResettableCustomerEntitlements({
			customerEntitlements,
			now: NOW,
		});

		expect(result).toHaveLength(1);
		expect(result[0].customer_product).toBeNull();
	});
});
