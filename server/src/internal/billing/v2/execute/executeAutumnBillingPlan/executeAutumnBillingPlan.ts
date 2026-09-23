import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyPlanRebalances } from "./applyPlanRebalances";
import { resolvePlanCatalog } from "./resolvePlanCatalog";
import { runPlanSideEffects } from "./runPlanSideEffects";
import { writePlanRows } from "./writePlanRows/writePlanRows";

export type AutumnBillingPlanResult = {
	/** `customer_exists`: the plan inserts a customer another request created first, so nothing was written. */
	status: "applied" | "customer_exists";
	/** The existing customer's internal id, when the worker or an email claim found it. */
	internalCustomerId?: string;
};

/** A billing plan's writes: the catalog rows it references, the customer's rows, the balance moves after them, then side effects. */
export const executeAutumnBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	stripeInvoice,
	stripeInvoiceItems,
	autumnInvoice,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
}): Promise<AutumnBillingPlanResult> => {
	// 1. Catalog
	await resolvePlanCatalog({ ctx, autumnBillingPlan });

	// 2. The customer's rows, then the rows only Postgres holds
	const written = await writePlanRows({ ctx, autumnBillingPlan });
	if (written.status === "customer_exists")
		return {
			status: written.status,
			internalCustomerId: written.internalCustomerId,
		};

	// 3. Balance moves the worker does not apply yet
	await applyPlanRebalances({ ctx, autumnBillingPlan });

	// 4. Side effects
	await runPlanSideEffects({
		ctx,
		autumnBillingPlan,
		pendingBatchTransitions: written.pendingBatchTransitions,
		stripeInvoice,
		stripeInvoiceItems,
		autumnInvoice,
	});
	return { status: "applied" };
};
