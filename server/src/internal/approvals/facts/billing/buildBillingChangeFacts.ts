import {
	type AttachBillingContext,
	type BillingContext,
	type BillingPlan,
	billingContextToCurrency,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanRaisesNextCycle } from "./billingPlanRaisesNextCycle";
import { billingPlanToChangedCustomerProducts } from "./billingPlanToChangedCustomerProducts";
import type { BillingPreviewTotals } from "./billingPreviewTotals";
import { changeAddsPayPerUsePrice } from "./changeAddsPayPerUsePrice";
import { changeToIncomingPlanFacts } from "./changeToIncomingPlanFacts";
import { findChangeCustomerProduct } from "./findChangeCustomerProduct";
import { isBillingChangePaid } from "./isBillingChangePaid";
import { stripeDiscountsToDiscountFacts } from "./stripeDiscountsToDiscountFacts";

/** Attach, update subscription, set plans, schedule. Totals come straight from the preview. */
export const buildBillingChangeFacts = ({
	ctx,
	billingContext,
	billingPlan,
	preview,
	currentDiscounts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
	currentDiscounts: StripeDiscountWithCoupon[];
}): BillingChangeFacts => {
	const { after, before } = billingPlanToChangedCustomerProducts({
		autumnBillingPlan: billingPlan.autumn,
	});
	const incomingCustomerProducts = preview.incoming.map((change) =>
		findChangeCustomerProduct({ change, customerProducts: after }),
	);
	const outgoing = preview.outgoing.map((change) =>
		findChangeCustomerProduct({ change, customerProducts: before }),
	);
	// Same order as the preview, so `incoming[0]` names the same plan in both.
	const incoming = preview.incoming.map((change, index) =>
		changeToIncomingPlanFacts({
			billingContext,
			change,
			customerProduct: incomingCustomerProducts[index],
		}),
	);

	const checkout =
		billingContext.checkoutMode === "stripe_checkout" ||
		billingContext.checkoutMode === "autumn_checkout";

	return {
		customer: billingContext.fullCustomer,
		incoming,
		outgoing,
		paid: isBillingChangePaid({
			checkout,
			total: preview.total,
			incoming,
			hasPaymentMethod: Boolean(billingContext.paymentMethod),
			raisesNextCycle: billingPlanRaisesNextCycle({
				ctx,
				billingContext,
				billingPlan,
				currentDiscounts,
			}),
			addsPayPerUsePrice: changeAddsPayPerUsePrice({
				incoming: incomingCustomerProducts,
				outgoing,
			}),
		}),
		checkout,
		total: preview.total,
		next_cycle: preview.next_cycle ? { total: preview.next_cycle.total } : null,
		discounts: stripeDiscountsToDiscountFacts({
			stripeDiscounts: billingContext.stripeDiscounts,
			currentDiscounts,
			currency: billingContextToCurrency({ org: ctx.org, billingContext }),
		}),
		plan_schedule:
			(billingContext as Partial<AttachBillingContext>).planTiming ?? null,
		proration_behavior: billingContext.requestedProrationBehavior ?? null,
		starts_at: billingContext.billingStartsAt ?? null,
		// Off is `{ enabled: false }`, never null: the rule editor stores "Invoice mode is No" that way.
		invoice_mode: { enabled: Boolean(billingContext.invoiceMode) },
	};
};
