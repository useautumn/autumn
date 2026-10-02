import { describe, expect, test } from "bun:test";
import type { FullProduct, SyncProductContext } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { products } from "@tests/utils/fixtures/db/products";
import { retainUnchangedFreeCustomerProducts } from "@/internal/billing/v2/actions/sync/setup/retainUnchangedFreeCustomerProducts";

const ctx = contexts.create({ features: [] });
const bonus = products.createFull({ id: "bonus", isAddOn: true });
const pro = products.createFull({ id: "pro" });

const bonusRow = customerProducts.create({
	id: "cus_prod_bonus",
	productId: bonus.id,
	product: bonus,
});
const fullCustomer = customers.create({ customerProducts: [bonusRow] });

const productContext = ({
	fullProduct = bonus,
	replaces,
}: {
	fullProduct?: FullProduct;
	replaces?: typeof bonusRow;
} = {}) =>
	({
		plan: { plan_id: fullProduct.id },
		fullProduct,
		customPrices: [],
		customEntitlements: [],
		featureQuantities: [],
		currentCustomerProduct: replaces,
	}) as SyncProductContext;

const retain = ({
	productContexts,
	laterProductContexts = [],
}: {
	productContexts: SyncProductContext[];
	laterProductContexts?: SyncProductContext[];
}) =>
	retainUnchangedFreeCustomerProducts({
		ctx,
		fullCustomer,
		currency: "usd",
		productContexts,
		laterProductContexts,
		retainedCustomerProductIds: new Set(),
	});

describe("retainUnchangedFreeCustomerProducts", () => {
	test("keeps the free row a plan starting now repeats unchanged", () => {
		const result = retain({ productContexts: [productContext()] });

		expect(result.retainedCustomerProducts).toEqual([bonusRow]);
		expect(result.productContexts).toEqual([]);
	});

	test("extra add-on instances insert alongside the kept row instead of expiring it", () => {
		const instance = productContext({ replaces: bonusRow });

		const result = retain({ productContexts: [instance, instance, instance] });

		expect(result.retainedCustomerProducts).toEqual([bonusRow]);
		expect(
			result.productContexts.map(
				({ currentCustomerProduct }) => currentCustomerProduct,
			),
		).toEqual([undefined, undefined]);
	});

	test("re-inserts a free row a later phase repeats, so it ends there", () => {
		const result = retain({
			productContexts: [productContext()],
			laterProductContexts: [productContext()],
		});

		expect(result.retainedCustomerProducts).toEqual([]);
		expect(result.productContexts).toHaveLength(1);
	});

	test("re-inserts a free row a later phase replaces, so it isn't expired while kept", () => {
		const result = retain({
			productContexts: [productContext()],
			laterProductContexts: [
				productContext({ fullProduct: pro, replaces: bonusRow }),
			],
		});

		expect(result.retainedCustomerProducts).toEqual([]);
		expect(result.productContexts).toHaveLength(1);
	});
});
