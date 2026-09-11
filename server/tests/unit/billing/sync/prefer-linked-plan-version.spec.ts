/**
 * Auto-sync rematch must keep a customer's current plan version when Stripe
 * prices are shared with a later catalog version (AthenaHQ: custom v10 → v18).
 *
 * Red (current):  catalog-only first-match returns the latest version.
 * Green (after):  preferred/linked products win the shared-price match.
 */

import { describe, expect, test } from "bun:test";
import type { FullProduct, Price } from "@autumn/shared";
import { mergePreferredProductsForDetection } from "@/internal/billing/v2/actions/sync/detect/mergePreferredProductsForDetection";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";
import { findAutumnMatchForStripeItem } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnMatchForStripeItem";

const catalogProduct = ({
	id,
	internalId,
	version,
	stripePriceId,
}: {
	id: string;
	internalId: string;
	version: number;
	stripePriceId: string;
}): FullProduct =>
	({
		id,
		internal_id: internalId,
		version,
		is_add_on: false,
		prices: [
			{
				id: `pr_${internalId}`,
				config: { stripe_price_id: stripePriceId },
			} as Price,
		],
		entitlements: [],
		items: [],
	}) as unknown as FullProduct;

const stripeItem = ({
	stripePriceId,
}: {
	stripePriceId: string;
}): StripeItemSnapshot => ({
	id: "si_base",
	stripe_price_id: stripePriceId,
	stripe_product_id: "prod_enterprise",
	unit_amount: 2000,
	unit_amount_decimal: null,
	currency: "usd",
	quantity: 1,
	billing_scheme: "per_unit",
	tiers_mode: null,
	tiers: null,
	recurring_interval: "month",
	recurring_interval_count: null,
	recurring_usage_type: "licensed",
	metadata: {},
});

describe("prefer linked plan version for shared Stripe prices", () => {
	const sharedPriceId = "price_enterprise_shared";
	const v10 = catalogProduct({
		id: "enterprise",
		internalId: "prod_enterprise_v10",
		version: 10,
		stripePriceId: sharedPriceId,
	});
	const v18 = catalogProduct({
		id: "enterprise",
		internalId: "prod_enterprise_v18",
		version: 18,
		stripePriceId: sharedPriceId,
	});

	test("catalog-only match returns the latest version (the auto-sync bug)", () => {
		const diff = findAutumnMatchForStripeItem({
			item: stripeItem({ stripePriceId: sharedPriceId }),
			fullProducts: [v18, v10],
		});

		expect(diff.match.kind).toBe("autumn_price");
		if (diff.match.kind === "none") throw new Error(diff.match.kind);
		expect(diff.match.product.version).toBe(18);
	});

	test("preferred current version wins the shared-price match", () => {
		const fullProducts = mergePreferredProductsForDetection({
			preferredProducts: [v10],
			catalog: [v18],
		});
		expect(fullProducts.map((product) => product.internal_id)).toEqual([
			"prod_enterprise_v10",
			"prod_enterprise_v18",
		]);

		const diff = findAutumnMatchForStripeItem({
			item: stripeItem({ stripePriceId: sharedPriceId }),
			fullProducts,
		});

		expect(diff.match.kind).toBe("autumn_price");
		if (diff.match.kind === "none") throw new Error(diff.match.kind);
		expect(diff.match.product.version).toBe(10);
		expect(diff.match.product.internal_id).toBe("prod_enterprise_v10");
	});

	test("unique newer Stripe price still selects the new version", () => {
		const v18Unique = catalogProduct({
			id: "enterprise",
			internalId: "prod_enterprise_v18",
			version: 18,
			stripePriceId: "price_enterprise_v18",
		});
		const fullProducts = mergePreferredProductsForDetection({
			preferredProducts: [v10],
			catalog: [v18Unique],
		});

		const diff = findAutumnMatchForStripeItem({
			item: stripeItem({ stripePriceId: "price_enterprise_v18" }),
			fullProducts,
		});

		expect(diff.match.kind).toBe("autumn_price");
		if (diff.match.kind === "none") throw new Error(diff.match.kind);
		expect(diff.match.product.version).toBe(18);
	});
});
