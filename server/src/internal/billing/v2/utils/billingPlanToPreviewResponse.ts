import {
	type BillingPreviewResponse,
	orgToCurrency,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const billingPlanToPreviewResponse = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): BillingPreviewResponse => {
	const { fullCustomer } = billingContext;

	const autumnBillingPlan = billingPlan.autumn;
	const previewLineItems = autumnBillingPlan.lineItems.map((line) => ({
		description: line.description,
		amount: line.finalAmount,
	}));

	const total = new Decimal(
		sumValues(previewLineItems.map((line) => line.amount)),
	)
		.toDP(2)
		.toNumber();

	const currency = orgToCurrency({ org: ctx.org });

	return {
		customer_id: fullCustomer.id || "",
		line_items: previewLineItems,
		total,
		currency,
	} satisfies BillingPreviewResponse;
};
