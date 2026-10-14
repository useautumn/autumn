import type { AutumnBillingPlan, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyPlanRebalances } from "./applyPlanRebalances";
import { resolvePlanCatalog } from "./resolvePlanCatalog";
import { runPlanSideEffects } from "./runPlanSideEffects";
import { writePlanRows } from "./writePlanRows/writePlanRows";

export type AutumnBillingPlanResult = {
	status: "applied" | "customer_exists";
	internalCustomerId?: string;
	allocationsAdjusted?: boolean;
};

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
	emitsBillingUpdated?: boolean;
}): Promise<AutumnBillingPlanResult> => {
	await resolvePlanCatalog({ ctx, autumnBillingPlan });

	const written = await writePlanRows({ ctx, autumnBillingPlan });
	if (written.status === "customer_exists")
		return {
			status: written.status,
			internalCustomerId: written.internalCustomerId,
		};

	if (!written.rebalancesApplied)
		await applyPlanRebalances({ ctx, autumnBillingPlan });

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
