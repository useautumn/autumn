import type { FullCustomer } from "@autumn/shared";
import { metadata } from "@autumn/shared";
import { count, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { StateCheckResult } from "./stateCheckTypes";

export const checkSubCountMatch = async ({
	ctx,
	fullCus,
	subs,
	result,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
	result: StateCheckResult;
}) => {
	const cusProducts = fullCus.customer_products;
	const subIds = [...new Set(cusProducts.flatMap((cp) => cp.subscription_ids))];

	const stripeSubs = subs.filter((sub) => {
		if (sub.status === "incomplete") return false;
		const subCustomerId =
			typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
		return subCustomerId === fullCus.processor?.id;
	});

	if (stripeSubs.length !== subIds.length) {
		// 1. Check if there are any invoice metadata's waiting to be processed...
		// const invoiceMetadata = await MetadataService.getByStripeInvoiceId({
		// 	db: ctx.db,
		// 	stripeInvoiceId: stripeSubs.map((sub) => sub.latest_invoice),
		// 	type: MetadataType.InvoiceCheckout,
		// });
		const invoiceIds = await stripeSubs.map((sub) => sub.latest_invoice);
		// Count of rows in metadata table with stripe_invoice_id in invoiceIds
		const metadataCount = await ctx.db
			.select({ count: count() })
			.from(metadata)
			.where(inArray(metadata.stripe_invoice_id, invoiceIds as string[]));

		if (stripeSubs.length - (metadataCount?.[0]?.count || 0) !== subIds.length) {
			result.passed = false;
			const errorMsg = `Expected ${subIds.length} subs in total, found ${stripeSubs.length} in Stripe`;
			result.errors.push(errorMsg);
			result.checks.push({
				name: "Subscription Count Match",
				type: "sub_count_match",
				passed: false,
				message: errorMsg,
			});
		}
		// result.passed = false;
		// result.errors.push(
		// 	`Expected ${subIds.length} subs in total, found ${stripeSubs.length} in Stripe`,
		// );
	} else {
		result.checks.push({
			name: `Subscription Match`,
			type: "sub_id_matching",
			passed: true,
		});
	}
};
