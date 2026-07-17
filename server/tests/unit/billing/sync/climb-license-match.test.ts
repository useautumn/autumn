import { expect, test } from "bun:test";
import {
	BillingInterval,
	type FullProduct,
	type ParentPlanLicense,
	type Price,
	PriceType,
} from "@autumn/shared";
import { climbLicenseMatch } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/licenseMatchUtils/climbLicenseMatch";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

const fixedPrice = ({
	id,
	amount,
	interval,
}: {
	id: string;
	amount: number;
	interval: BillingInterval;
}): Price =>
	({
		id,
		internal_product_id: "seat_internal",
		config: { type: PriceType.Fixed, amount, interval },
		proration_config: null,
	}) as Price;

const parentLink = ({
	id,
	parentPlanId,
	price,
}: {
	id: string;
	parentPlanId: string;
	price: Price;
}): ParentPlanLicense =>
	({
		id,
		customized: true,
		product: { id: parentPlanId, internal_id: `${parentPlanId}_internal` },
		license_prices: [price],
	}) as ParentPlanLicense;

const stripeItem = ({
	amount,
	interval,
}: {
	amount: number;
	interval: "month" | "year";
}): StripeItemSnapshot => ({
	id: "si_test",
	stripe_price_id: "price_test",
	stripe_product_id: "prod_dev_seat",
	unit_amount: amount * 100,
	unit_amount_decimal: String(amount * 100),
	currency: "usd",
	quantity: 2,
	billing_scheme: "per_unit",
	tiers_mode: null,
	tiers: null,
	recurring_interval: interval,
	recurring_interval_count: 1,
	recurring_usage_type: "licensed",
	metadata: {},
});

const licenseProduct = ({
	links,
}: {
	links: ParentPlanLicense[];
}): FullProduct =>
	({
		id: "dev_seat",
		internal_id: "seat_internal",
		processor: { type: "stripe", id: "prod_dev_seat" },
		prices: [
			fixedPrice({
				id: "price_base",
				amount: 10,
				interval: BillingInterval.Month,
			}),
		],
		parent_plan_licenses: links,
	}) as FullProduct;

const climb = ({
	links,
	item,
}: {
	links: ParentPlanLicense[];
	item: StripeItemSnapshot;
}) => {
	const product = licenseProduct({ links });
	return climbLicenseMatch({
		item,
		match: {
			kind: "autumn_product",
			matched_on: {
				type: "stripe_product_id",
				stripe_product_id: "prod_dev_seat",
			},
			product,
		},
	});
};

test("license climb: one parent base-price shape selects that link", () => {
	const monthlyPrice = fixedPrice({
		id: "price_monthly",
		amount: 20,
		interval: BillingInterval.Month,
	});
	const annualPrice = fixedPrice({
		id: "price_annual",
		amount: 200,
		interval: BillingInterval.Year,
	});
	const match = climb({
		links: [
			parentLink({
				id: "link_monthly",
				parentPlanId: "pro",
				price: monthlyPrice,
			}),
			parentLink({
				id: "link_annual",
				parentPlanId: "pro_annual",
				price: annualPrice,
			}),
		],
		item: stripeItem({ amount: 20, interval: "month" }),
	});

	expect(match.kind).toBe("autumn_license");
	if (match.kind !== "autumn_license") return;
	expect(match.parent_plan_license.id).toBe("link_monthly");
	expect(match.price?.id).toBe(monthlyPrice.id);
});

test("license climb: no parent base-price shape remains ambiguous", () => {
	const match = climb({
		links: [
			parentLink({
				id: "link_monthly",
				parentPlanId: "pro",
				price: fixedPrice({
					id: "price_monthly",
					amount: 20,
					interval: BillingInterval.Month,
				}),
			}),
			parentLink({
				id: "link_annual",
				parentPlanId: "pro_annual",
				price: fixedPrice({
					id: "price_annual",
					amount: 200,
					interval: BillingInterval.Year,
				}),
			}),
		],
		item: stripeItem({ amount: 30, interval: "month" }),
	});

	expect(match.kind).toBe("none");
});

test("license climb: multiple parent base-price shapes remain ambiguous", () => {
	const monthlyPrice = fixedPrice({
		id: "price_monthly",
		amount: 20,
		interval: BillingInterval.Month,
	});
	const match = climb({
		links: [
			parentLink({
				id: "link_one",
				parentPlanId: "pro",
				price: monthlyPrice,
			}),
			parentLink({
				id: "link_two",
				parentPlanId: "other_pro",
				price: { ...monthlyPrice, id: "price_monthly_duplicate" },
			}),
		],
		item: stripeItem({ amount: 20, interval: "month" }),
	});

	expect(match.kind).toBe("none");
});
