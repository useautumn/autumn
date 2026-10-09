import { describe, expect, test } from "bun:test";
import type { FullPlanLicense, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deriveStoredCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveStoredCustomerProductIsCustom";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct";
import {
	allFeatures,
	catalogPlan,
	customerPlan,
	fakeLogger,
	includedItem,
	planLicense,
} from "./isCustomFixtures";

const licenseCatalogProduct = planLicense().product;

/** A license link whose terms add credits on top of its license plan. */
const customizedLicense = ({
	withBaseProduct,
}: {
	withBaseProduct: boolean;
}): FullPlanLicense => {
	const link = planLicense();
	return {
		...link,
		customized: true,
		product: {
			...link.product,
			entitlements: [includedItem({ allowance: 500 }).entitlement],
		},
		...(withBaseProduct ? { base_product: licenseCatalogProduct } : {}),
	} as FullPlanLicense;
};

const deriveStored = ({
	catalog,
	customer,
	licenseCatalog = licenseCatalogProduct,
}: {
	catalog: FullProduct;
	customer: ReturnType<typeof customerPlan>;
	licenseCatalog?: FullPlanLicense["product"] | null;
}) => {
	const baseProducts: BaseProductCache = new Map([
		[customer.internal_product_id, Promise.resolve(catalog)],
		[
			licenseCatalogProduct.internal_id,
			Promise.resolve(licenseCatalog as FullProduct | null),
		],
	]);
	return deriveStoredCustomerProductIsCustom({
		ctx: {
			logger: fakeLogger(),
			features: allFeatures,
		} as unknown as AutumnContext,
		customerProduct: customer,
		baseProducts,
	});
};

describe("deriveStoredCustomerProductIsCustom licenses", () => {
	test("a customised license the catalog shares matches once its catalog product is loaded", async () => {
		const result = await deriveStored({
			catalog: catalogPlan({
				licenses: [customizedLicense({ withBaseProduct: true })],
			}),
			customer: customerPlan({
				licenses: [customizedLicense({ withBaseProduct: false })],
			}),
		});
		expect(result.outcome).toBe("matches_catalog");
	});

	test("a license customised only for the customer reads as custom", async () => {
		const result = await deriveStored({
			catalog: catalogPlan({ licenses: [planLicense()] }),
			customer: customerPlan({
				licenses: [customizedLicense({ withBaseProduct: false })],
			}),
		});
		expect(result.outcome).toBe("customized");
		if (result.outcome !== "customized") return;
		expect(result.diff.upsert_licenses?.[0]?.license_plan_id).toBe("seat_plan");
	});

	test("a license whose catalog product can't be loaded is treated as custom", async () => {
		const result = await deriveStored({
			catalog: catalogPlan({ licenses: [planLicense()] }),
			customer: customerPlan({
				licenses: [customizedLicense({ withBaseProduct: false })],
			}),
			licenseCatalog: null,
		});
		expect(result.outcome).toBe("catalog_missing");
	});
});
