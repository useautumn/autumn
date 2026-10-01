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
	/** Allocated shares changed; set only when the caller sends billing.updated itself. */
	allocationsAdjusted?: boolean;
};

/** A billing plan's writes: the catalog rows it references, the customer's rows, the balance moves after them, then side effects. */
export const executeAutumnBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	stripeInvoice,
	stripeInvoiceItems,
	autumnInvoice,
	emitsBillingUpdated = false,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeInvoice?: Stripe.Invoice;
	stripeInvoiceItems?: Stripe.InvoiceItem[];
	autumnInvoice?: Invoice;
	/** The caller sends billing.updated after this; allocation changes ride on that event. */
	emitsBillingUpdated?: boolean;
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

	// 3. Purchases, when the worker did not size them with the rows. Temporary: its Redis patch can't run inside
	// the Postgres transaction; remove with the Postgres write path (and `rebalancesApplied` with it).
	if (!written.rebalancesApplied)
		await applyPlanRebalances({ ctx, autumnBillingPlan });

	// 4. Side effects
	const { allocationsAdjusted } = await runPlanSideEffects({
		ctx,
		autumnBillingPlan,
		pendingBatchTransitions: written.pendingBatchTransitions,
		stripeInvoice,
		stripeInvoiceItems,
		autumnInvoice,
		emitsBillingUpdated,
	});
	return { status: "applied", allocationsAdjusted };
};
