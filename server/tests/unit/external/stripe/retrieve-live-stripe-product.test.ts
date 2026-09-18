import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { retrieveLiveStripeProduct } from "@/external/stripe/products/utils/retrieveLiveStripeProduct.js";

type UpdateCall = { id: string; params: Stripe.ProductUpdateParams };

const makeStripeCli = ({
	product,
}: {
	product: { id: string; active: boolean } | null;
}) => {
	const retrieveCalls: string[] = [];
	const updateCalls: UpdateCall[] = [];

	const stripeCli = {
		products: {
			retrieve: async (id: string) => {
				retrieveCalls.push(id);
				if (!product) throw new Error("resource_missing");
				return product;
			},
			update: async (id: string, params: Stripe.ProductUpdateParams) => {
				updateCalls.push({ id, params });
				return { ...product, id, ...params };
			},
		},
	} as unknown as Stripe;

	return { stripeCli, retrieveCalls, updateCalls };
};

describe("retrieveLiveStripeProduct", () => {
	test("returns an active product untouched", async () => {
		const { stripeCli, updateCalls } = makeStripeCli({
			product: { id: "prod_live", active: true },
		});

		const product = await retrieveLiveStripeProduct({
			stripeCli,
			productId: "prod_live",
		});

		expect(product?.id).toBe("prod_live");
		expect(updateCalls).toHaveLength(0);
	});

	test("un-archives an inactive product and returns it live", async () => {
		const { stripeCli, updateCalls } = makeStripeCli({
			product: { id: "prod_archived", active: false },
		});

		const product = await retrieveLiveStripeProduct({
			stripeCli,
			productId: "prod_archived",
		});

		expect(updateCalls).toEqual([
			{ id: "prod_archived", params: { active: true } },
		]);
		expect(product?.id).toBe("prod_archived");
		expect(product?.active).toBe(true);
	});

	test("returns null for a missing product", async () => {
		const { stripeCli, updateCalls } = makeStripeCli({ product: null });

		const product = await retrieveLiveStripeProduct({
			stripeCli,
			productId: "prod_deleted",
		});

		expect(product).toBeNull();
		expect(updateCalls).toHaveLength(0);
	});

	test("returns null without calling Stripe when no product id is set", async () => {
		const { stripeCli, retrieveCalls } = makeStripeCli({
			product: { id: "prod_live", active: true },
		});

		expect(
			await retrieveLiveStripeProduct({ stripeCli, productId: null }),
		).toBeNull();
		expect(retrieveCalls).toHaveLength(0);
	});
});
