/**
 * initStripeResourcesForCatalog — creation guards (G-matrix) + no product reads.
 *
 * Carry is compute-side and env-independent; this asserts the execute step:
 * reuse always runs against in-memory family candidates, Stripe creation
 * never happens here (resources are created lazily at billing time in both
 * envs), and ProductService.getFull is never called.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	type FullProduct,
	type Price,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	reuseCalls: 0,
	familyReuseCalls: 0,
	productCreateCalls: 0,
	priceCreateCalls: 0,
	reuseCandidateIds: [] as string[],
};

const paidPrice = (): Price => ({
	id: "price_1",
	internal_product_id: "prod_internal",
	org_id: "org_1",
	created_at: 1,
	tier_behavior: null,
	is_custom: false,
	entitlement_id: null,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount: 20,
		interval: BillingInterval.Month,
		stripe_price_id: null,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
	},
});

const unInitedProduct = ({
	env,
	internalId = "prod_internal",
	baseInternalProductId = null,
	baseProduct,
}: {
	env: AppEnv;
	internalId?: string;
	baseInternalProductId?: string | null;
	baseProduct?: FullProduct;
}): FullProduct =>
	({
		id: internalId,
		name: "Team",
		internal_id: internalId,
		org_id: "org_1",
		env,
		version: 1,
		created_at: 1,
		processor: null,
		base_internal_product_id: baseInternalProductId,
		base_variant_id: null,
		is_add_on: false,
		is_default: false,
		archived: false,
		group: "",
		description: null,
		config: {},
		metadata: {},
		prices: [paidPrice()],
		entitlements: [],
		free_trial: null,
		licenses: [],
		...(baseProduct ? { base_product: baseProduct } : {}),
	}) as unknown as FullProduct;

await mockModuleWithRestore("@/internal/products/ProductService.js", () => ({
	ProductService: {
		getFull: async () => {
			throw new Error("initStripeResourcesForCatalog must not getFull");
		},
	},
}));

await mockModuleWithRestore(
	"@/internal/products/stripeResourceUtils/applyStripeResourceReuseForProduct",
	() => ({
		applyStripeResourceReuseForProduct: async ({
			candidateProducts = [],
		}: {
			candidateProducts?: FullProduct[];
		}) => {
			mockState.reuseCalls++;
			mockState.reuseCandidateIds = candidateProducts.map(
				(candidate) => candidate.internal_id,
			);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/products/stripeResourceUtils/applyStripeReuseFromVariantFamilies",
	() => ({
		applyStripeReuseFromVariantFamilies: async () => {
			mockState.familyReuseCalls++;
		},
	}),
);

await mockModuleWithRestore("@/internal/products/productUtils", () => ({
	checkStripeProductExists: async () => {
		mockState.productCreateCalls++;
	},
}));

await mockModuleWithRestore(
	"@/external/stripe/createStripePrice/createStripePrice",
	() => ({
		createStripePriceIFNotExist: async () => {
			mockState.priceCreateCalls++;
		},
	}),
);

import { initStripeResourcesForCatalog } from "@/internal/catalogV2/execute/executeInitStripeResources/initStripeResourcesForCatalog";

const buildCtx = ({
	env,
	stripeConnected,
}: {
	env: AppEnv;
	stripeConnected: boolean;
}): AutumnContext =>
	({
		db: {},
		env,
		org: {
			id: "org_1",
			config: { disable_stripe_writes: false },
			stripe_config: stripeConnected
				? { test_api_key: "sk_test_x", live_api_key: "sk_live_x" }
				: null,
		},
		logger: { debug: () => undefined, info: () => undefined },
	}) as unknown as AutumnContext;

const buildPlan = ({
	nextFullProduct,
	createInStripe,
	projectedProducts,
}: {
	nextFullProduct: FullProduct;
	createInStripe?: boolean;
	projectedProducts?: FullProduct[];
}): UpdateCatalogPlan =>
	({
		upsertProducts: [
			{
				row: {
					op: "create",
					nextFullProduct,
				},
				...(createInStripe === false ? { createInStripe: false } : {}),
			},
		],
		projected: {
			features: [],
			products: projectedProducts ?? [nextFullProduct],
		},
	}) as unknown as UpdateCatalogPlan;

describe("initStripeResourcesForCatalog creation guards", () => {
	beforeEach(() => {
		mockState.reuseCalls = 0;
		mockState.familyReuseCalls = 0;
		mockState.productCreateCalls = 0;
		mockState.priceCreateCalls = 0;
		mockState.reuseCandidateIds = [];
	});

	test("sandbox + connected runs reuse but never creates Stripe objects", async () => {
		const product = unInitedProduct({ env: AppEnv.Sandbox });
		await initStripeResourcesForCatalog({
			ctx: buildCtx({ env: AppEnv.Sandbox, stripeConnected: true }),
			updateCatalogPlan: buildPlan({ nextFullProduct: product }),
		});

		expect(mockState.reuseCalls).toBeGreaterThan(0);
		expect(mockState.familyReuseCalls).toBe(0);
		expect(mockState.productCreateCalls).toBe(0);
		expect(mockState.priceCreateCalls).toBe(0);
	});

	test("Live runs in-memory reuse but never creates Stripe objects", async () => {
		const product = unInitedProduct({ env: AppEnv.Live });
		await initStripeResourcesForCatalog({
			ctx: buildCtx({ env: AppEnv.Live, stripeConnected: true }),
			updateCatalogPlan: buildPlan({ nextFullProduct: product }),
		});

		expect(mockState.reuseCalls).toBeGreaterThan(0);
		expect(mockState.familyReuseCalls).toBe(0);
		expect(mockState.productCreateCalls).toBe(0);
		expect(mockState.priceCreateCalls).toBe(0);
	});

	test("disconnected org runs reuse but never creates Stripe objects", async () => {
		const product = unInitedProduct({ env: AppEnv.Sandbox });
		await initStripeResourcesForCatalog({
			ctx: buildCtx({ env: AppEnv.Sandbox, stripeConnected: false }),
			updateCatalogPlan: buildPlan({ nextFullProduct: product }),
		});

		expect(mockState.reuseCalls).toBeGreaterThan(0);
		expect(mockState.familyReuseCalls).toBe(0);
		expect(mockState.productCreateCalls).toBe(0);
		expect(mockState.priceCreateCalls).toBe(0);
	});

	test("create_in_stripe false reuses from nested base_product and never creates", async () => {
		const team = unInitedProduct({
			env: AppEnv.Sandbox,
			internalId: "team_v1",
		});
		team.processor = { type: "stripe", id: "prod_team" };
		const teamEu = unInitedProduct({
			env: AppEnv.Sandbox,
			internalId: "eu_v1",
			baseInternalProductId: "team_v1",
			baseProduct: team,
		});

		await initStripeResourcesForCatalog({
			ctx: buildCtx({ env: AppEnv.Sandbox, stripeConnected: true }),
			updateCatalogPlan: buildPlan({
				nextFullProduct: teamEu,
				createInStripe: false,
				projectedProducts: [teamEu],
			}),
		});

		expect(mockState.reuseCalls).toBe(1);
		expect(mockState.reuseCandidateIds).toEqual(["team_v1"]);
		expect(mockState.familyReuseCalls).toBe(0);
		expect(mockState.productCreateCalls).toBe(0);
		expect(mockState.priceCreateCalls).toBe(0);
	});
});

afterAll(() => {
	mock.restore();
});
