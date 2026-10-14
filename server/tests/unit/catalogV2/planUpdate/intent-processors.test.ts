import { describe, expect, test } from "bun:test";
import {
	type ApiPlanProcessors,
	AppEnv,
	productKeyToString,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { intentToUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/intentToUpsertProductPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { emptyVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const PLAN_ID = "pro";

const ctx = {
	env: AppEnv.Sandbox,
	org: { id: "org_test", planAliases: {}, config: {}, default_currency: "usd" },
	features: [],
} as unknown as AutumnContext;

const currentRow = {
	...products.createFull({ id: PLAN_ID, stripeProductId: "prod_old" }),
	internal_id: `internal_${PLAN_ID}_v1`,
};

const productStatesContext = ({
	withCurrent,
}: {
	withCurrent: boolean;
}): ProductStatesContext => ({
	statesByPlanVersion: withCurrent
		? {
				[productKeyToString({ productKey: { planId: PLAN_ID, version: 1 } })]: {
					productKey: { planId: PLAN_ID, version: 1 },
					currentFullProduct: currentRow,
					customerUsage: emptyVersioningFlags(),
				},
			}
		: {},
	versionsByPlanId: withCurrent ? { [PLAN_ID]: [currentRow] } : {},
	rewardProgramsByPlanId: {},
});

const fold = ({
	source,
	processors,
	planId = PLAN_ID,
	withCurrent = true,
}: {
	source: UpsertProductSource;
	processors?: ApiPlanProcessors;
	planId?: string;
	withCurrent?: boolean;
}) =>
	intentToUpsertProductPlan({
		ctx,
		intent: {
			productKey: { planId, version: 1 },
			planParams: {
				plan_id: planId,
				version: 1,
				...(processors !== undefined ? { processors } : {}),
			},
			source,
		},
		productStatesContext: productStatesContext({ withCurrent }),
	});

describe("stripe unlink flag", () => {
	test("a direct `stripe: null` marks the row as deliberately unlinked", () => {
		const upsert = fold({ source: "direct", processors: { stripe: null } });
		expect(upsert.row.nextFullProduct.processor).toBeNull();
		expect(upsert.stripeUnlinked).toBe(true);
	});

	test("the processor_sync fan-out row carries the flag too", () => {
		const upsert = fold({
			source: "processor_sync",
			processors: { stripe: null },
		});
		expect(upsert.stripeUnlinked).toBe(true);
	});

	test("the variant_propagation row carries the flag too", () => {
		const upsert = fold({
			source: "variant_propagation",
			processors: { stripe: null },
		});
		expect(upsert.stripeUnlinked).toBe(true);
	});

	test("a stated product_id is not an unlink", () => {
		const upsert = fold({
			source: "direct",
			processors: { stripe: { product_id: "prod_new" } },
		});
		expect(upsert.stripeUnlinked).toBeUndefined();
	});

	test("omitted processors is not an unlink", () => {
		expect(fold({ source: "direct" }).stripeUnlinked).toBeUndefined();
	});
});

describe("revenuecat processor carry", () => {
	const revenuecat = { products: [{ product_id: "rc_pro_monthly" }] };

	test("a variant_link create carries the stated mapping", () => {
		expect(
			fold({
				source: "variant_link",
				processors: { revenuecat },
				planId: "pro-eu",
				withCurrent: false,
			}).revenuecatProcessor,
		).toEqual(revenuecat);
	});

	test("a variant_propagation edit carries the stated mapping", () => {
		expect(
			fold({ source: "variant_propagation", processors: { revenuecat } })
				.revenuecatProcessor,
		).toEqual(revenuecat);
	});

	test("a direct entry still carries it", () => {
		expect(
			fold({ source: "direct", processors: { revenuecat } })
				.revenuecatProcessor,
		).toEqual(revenuecat);
	});

	test("the stripe fan-out lane does not write a mapping", () => {
		expect(
			fold({ source: "processor_sync", processors: { revenuecat } })
				.revenuecatProcessor,
		).toBeUndefined();
	});
});
