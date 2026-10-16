import { describe, expect, test } from "bun:test";
import type { Feature, Price, UsagePriceConfig } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import type Stripe from "stripe";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

await mockModuleWithRestore(
	"@server/internal/features/repos/updateFeatureStripeProductIdIfUnset.js",
	() => ({ updateFeatureStripeProductIdIfUnset: async () => undefined }),
);

const { resolveStripeProductForFeaturePrice } = await import(
	"@/external/stripe/products/utils/resolveStripeProductForFeaturePrice.js"
);

type UpdateCall = { id: string; params: Stripe.ProductUpdateParams };

const makeStripeCli = ({
	createdProduct,
	storedProducts,
}: {
	createdProduct: { id: string; active: boolean };
	storedProducts: Record<string, { id: string; active: boolean }>;
}) => {
	const createCalls: Stripe.ProductCreateParams[] = [];
	const updateCalls: UpdateCall[] = [];

	const stripeCli = {
		products: {
			retrieve: async (id: string) => {
				const stored = storedProducts[id];
				if (!stored) throw new Error("resource_missing");
				return stored;
			},
			create: async (params: Stripe.ProductCreateParams) => {
				createCalls.push(params);
				return createdProduct;
			},
			update: async (id: string, params: Stripe.ProductUpdateParams) => {
				updateCalls.push({ id, params });
				const stored = storedProducts[id];
				storedProducts[id] = { ...stored, id, ...params } as {
					id: string;
					active: boolean;
				};
				return storedProducts[id];
			},
		},
	} as unknown as Stripe;

	return { stripeCli, createCalls, updateCalls };
};

const db = {} as DrizzleCli;

const makeFeature = ({
	stripeProductId,
}: {
	stripeProductId?: string | null;
}) =>
	({
		internal_id: "feature_internal_1",
		id: "messages",
		name: "Messages",
		stripe_product_id: stripeProductId ?? null,
	}) as unknown as Feature;

const makePrice = ({ stripeProductId }: { stripeProductId?: string | null }) =>
	({
		id: "price_usage_1",
		config: { stripe_product_id: stripeProductId ?? undefined },
	}) as unknown as Price;

describe("resolveStripeProductForFeaturePrice", () => {
	test("un-archives the product behind a stale idempotent create replay", async () => {
		// Stripe replays the original `active: true` body for an archived product.
		const { stripeCli, createCalls, updateCalls } = makeStripeCli({
			createdProduct: { id: "prod_feature", active: true },
			storedProducts: { prod_feature: { id: "prod_feature", active: false } },
		});
		const price = makePrice({});

		const productId = await resolveStripeProductForFeaturePrice({
			db,
			stripeCli,
			feature: makeFeature({}),
			price,
		});

		expect(createCalls).toHaveLength(1);
		expect(updateCalls).toEqual([
			{ id: "prod_feature", params: { active: true } },
		]);
		expect(productId).toBe("prod_feature");
		expect((price.config as UsagePriceConfig).stripe_product_id).toBe(
			"prod_feature",
		);
	});

	test("un-archives when the create response itself is inactive", async () => {
		const { stripeCli, updateCalls } = makeStripeCli({
			createdProduct: { id: "prod_feature", active: false },
			storedProducts: { prod_feature: { id: "prod_feature", active: false } },
		});

		const productId = await resolveStripeProductForFeaturePrice({
			db,
			stripeCli,
			feature: makeFeature({}),
			price: makePrice({}),
		});

		expect(updateCalls).toEqual([
			{ id: "prod_feature", params: { active: true } },
		]);
		expect(productId).toBe("prod_feature");
	});

	test("un-archives the feature's existing product instead of creating one", async () => {
		const { stripeCli, createCalls, updateCalls } = makeStripeCli({
			createdProduct: { id: "prod_new", active: true },
			storedProducts: { prod_existing: { id: "prod_existing", active: false } },
		});
		const price = makePrice({});

		const productId = await resolveStripeProductForFeaturePrice({
			db,
			stripeCli,
			feature: makeFeature({ stripeProductId: "prod_existing" }),
			price,
		});

		expect(createCalls).toHaveLength(0);
		expect(updateCalls).toEqual([
			{ id: "prod_existing", params: { active: true } },
		]);
		expect(productId).toBe("prod_existing");
		expect((price.config as UsagePriceConfig).stripe_product_id).toBe(
			"prod_existing",
		);
	});

	test("reuses a live product on the price without touching Stripe writes", async () => {
		const { stripeCli, createCalls, updateCalls } = makeStripeCli({
			createdProduct: { id: "prod_new", active: true },
			storedProducts: { prod_price: { id: "prod_price", active: true } },
		});

		const productId = await resolveStripeProductForFeaturePrice({
			db,
			stripeCli,
			feature: makeFeature({}),
			price: makePrice({ stripeProductId: "prod_price" }),
		});

		expect(createCalls).toHaveLength(0);
		expect(updateCalls).toHaveLength(0);
		expect(productId).toBe("prod_price");
	});
});
