import {
	type AttachBillingContext,
	type BillingContext,
	type BillingPlan,
	billingContextToCurrency,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	BillingChangeFacts,
	EntityFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingContextBillsWithoutCustomer } from "./billingContextBillsWithoutCustomer";
import { billingContextToCycleAnchorFacts } from "./billingContextToCycleAnchorFacts";
import { billingPlanRaisesNextCycle } from "./billingPlanRaisesNextCycle";
import { billingPlanToChangedCustomerProducts } from "./billingPlanToChangedCustomerProducts";
import type { BillingPreviewTotals } from "./billingPreviewTotals";
import { changeAddsPayPerUsePrice } from "./changeAddsPayPerUsePrice";
import { changeRaisesRecurringPrice } from "./changeRaisesRecurringPrice";
import { changeToIncomingPlanFacts } from "./changeToIncomingPlanFacts";
import { isBillingChangePaid } from "./isBillingChangePaid";
import { matchChangesToCustomerProducts } from "./matchChangesToCustomerProducts";
import { stripeDiscountsToDiscountFacts } from "./stripeDiscountsToDiscountFacts";

/** Attach, update, set plans, create schedule. Totals come straight from the preview. */
export const buildBillingChangeFacts = ({
	ctx,
	billingContext,
	billingPlan,
	preview,
	customer,
	entity,
	currentDiscounts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
	customer: ApprovalCustomerFacts;
	entity: EntityFacts;
	currentDiscounts: StripeDiscountWithCoupon[];
}): BillingChangeFacts => {
	const { after, before } = billingPlanToChangedCustomerProducts({
		autumnBillingPlan: billingPlan.autumn,
	});
	const incomingCustomerProducts = matchChangesToCustomerProducts({
		changes: preview.incoming,
		customerProducts: after,
	});
	const outgoing = matchChangesToCustomerProducts({
		changes: preview.outgoing,
		customerProducts: before,
	});
	// Same order as the preview, so `incoming[0]` names the same plan in both.
	const incoming = preview.incoming.map((change, index) =>
		changeToIncomingPlanFacts({
			billingContext,
			change,
			customerProduct: incomingCustomerProducts[index],
		}),
	);

	const currency = billingContextToCurrency({ org: ctx.org, billingContext });
	const checkout =
		billingContext.checkoutMode === "stripe_checkout" ||
		billingContext.checkoutMode === "autumn_checkout";

	return {
		customer,
		entity,
		incoming,
		outgoing,
		paid: isBillingChangePaid({
			checkout,
			total: preview.total,
			billsWithoutCustomer: billingContextBillsWithoutCustomer({
				billingContext,
			}),
			plans: incomingCustomerProducts.map((customerProduct, index) => ({
				trial: incoming[index].free_trial,
				raisesRecurringPrice: changeRaisesRecurringPrice({
					incoming: [customerProduct],
					outgoing,
					currency,
				}),
				addsPayPerUsePrice: changeAddsPayPerUsePrice({
					incoming: [customerProduct],
					outgoing,
				}),
			})),
			raisesRecurringPrice: changeRaisesRecurringPrice({
				incoming: incomingCustomerProducts,
				outgoing,
				currency,
			}),
			raisesNextCycle: billingPlanRaisesNextCycle({
				ctx,
				billingContext,
				billingPlan,
				currentDiscounts,
			}),
		}),
		checkout,
		total: preview.total,
		next_cycle: preview.next_cycle ? { total: preview.next_cycle.total } : null,
		discounts: stripeDiscountsToDiscountFacts({
			stripeDiscounts: billingContext.stripeDiscounts,
			currentDiscounts,
			currency,
		}),
		plan_schedule:
			(billingContext as Partial<AttachBillingContext>).planTiming ?? null,
		proration_behavior: billingContext.requestedProrationBehavior ?? null,
		billing_cycle_anchor: billingContextToCycleAnchorFacts({ billingContext }),
		starts_at: billingContext.billingStartsAt ?? null,
		// Off is `{ enabled: false }`, never null: the rule editor stores "Invoice mode is No" that way.
		invoice_mode: { enabled: Boolean(billingContext.invoiceMode) },
	};
};
