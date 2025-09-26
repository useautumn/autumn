import {
	type AppEnv,
	CusExpand,
	type FullCustomer,
	type Organization,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { lineItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { stripeDiscountToResponse } from "./stripeDiscountToResponse.js";

export const getCusUpcomingInvoice = async ({
	db,
	org,
	env,
	fullCus,
	expand,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	fullCus: FullCustomer;
	expand: CusExpand[];
}) => {
	if (!expand.includes(CusExpand.UpcomingInvoice)) return undefined;

	const subIds = fullCus.customer_products.flatMap(
		(cp) => cp.subscription_ids || [],
	);

	if (subIds.length === 0) return null;

	const stripeCli = createStripeCli({ org, env });

	const subs = await getStripeSubs({
		stripeCli,
		subIds,
	});

	const sub = subs.reduce((acc, sub) => {
		const curSubPeriodEnd = getEarliestPeriodEnd({ sub });
		const nextSubPeriodEnd = getEarliestPeriodEnd({ sub });
		return nextSubPeriodEnd < curSubPeriodEnd ? sub : acc;
	}, subs[0]);

	const upcomingInvoice = await stripeCli.invoices.createPreview({
		customer: fullCus.processor?.id,
		subscription: sub.id,
		expand: ["discounts.coupon"],
	});

	const lines = [];
	for (const line of upcomingInvoice.lines.data) {
		const cusProd = fullCus.customer_products.find((cp) =>
			lineItemInCusProduct({ cusProduct: cp, lineItem: line }),
		);
		lines.push({
			product_id: cusProd?.product.id || null,
			description: line.description,
			amount: new Decimal(line.amount).div(100).toDecimalPlaces(2).toNumber(),
		});
	}

	const stripeDiscounts = upcomingInvoice.discounts.filter(
		(d): d is Stripe.Discount =>
			typeof d === "object" && d !== null && "coupon" in d,
	) as Stripe.Discount[];

	// Get reward in IDs

	const discounts = stripeDiscounts.map((d) =>
		stripeDiscountToResponse({
			discount: d,
			totalDiscountAmounts: upcomingInvoice.total_discount_amounts || undefined,
		}),
	);

	// console.log("lines: ", lines);
	// console.log("discounts: ", discounts);

	const res = {
		lines,
		discounts,
		subtotal: upcomingInvoice.subtotal / 100,
		total: upcomingInvoice.total / 100,
		currency: upcomingInvoice.currency,
	};

	return res;
};
