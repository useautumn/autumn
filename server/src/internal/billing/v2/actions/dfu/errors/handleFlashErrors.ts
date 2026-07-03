import { isResettingEntitlement, RecaseError } from "@autumn/shared";
import type { FlashContext } from "../setup/setupFlashContext";

const rejectUnsupported = (message: string): never => {
	throw new RecaseError({
		message: `dfu.flash: ${message} is not yet supported`,
		code: "unsupported_field",
		statusCode: 400,
	});
};

/**
 * Guards deferred capabilities and enforces cross-processor exclusivity. We call
 * executeAutumnBillingPlan directly, bypassing attach's PSP guards, so the
 * cross-processor rule is enforced here.
 */
export const handleFlashErrors = ({
	flashContext,
}: {
	flashContext: FlashContext;
}): void => {
	const { params, planContexts } = flashContext;

	const allBillables = [
		...params.billables,
		...(params.entities?.flatMap((entity) => entity.billables) ?? []),
	];
	for (const billable of allBillables) {
		for (const phase of billable.phases ?? []) {
			if (phase.starting_after) rejectUnsupported("starting_after");
			for (const plan of phase.plans) {
				if (plan.customize) rejectUnsupported("customize");
				for (const balance of plan.balances ?? []) {
					if (balance.rollover) rejectUnsupported("balance rollover");
				}
			}
		}
	}

	// Cross-processor exclusivity: a Stripe-owned recurring base plan and a
	// RevenueCat-owned recurring base plan can't coexist. Add-ons and one-offs
	// are parallel cus_products and safe to mix.
	const hasStripeRecurringBase = planContexts.some(
		(pc) => pc.processor === "stripe" && !pc.isAddOn && pc.isRecurring,
	);
	const hasRevenuecatRecurringBase = planContexts.some(
		(pc) => pc.processor === "revenuecat" && !pc.isAddOn && pc.isRecurring,
	);
	if (hasStripeRecurringBase && hasRevenuecatRecurringBase) {
		throw new RecaseError({
			message:
				"dfu.flash: a recurring Stripe base plan and a recurring RevenueCat base plan cannot be flashed together",
			code: "cross_processor_conflict",
			statusCode: 400,
		});
	}

	// A resetting plan whose anchor can't be resolved would silently anchor its
	// credit resets to the import time — require an explicit start instead.
	for (const planContext of planContexts) {
		const hydration =
			planContext.stripeHydration ?? planContext.revenueCatHydration;
		const anchorResolvable =
			planContext.billingCycleAnchor != null ||
			hydration?.periodEndMs != null ||
			planContext.plan.started_at != null ||
			hydration?.startsAt != null;
		if (anchorResolvable) continue;

		const hasResettingEntitlement = planContext.fullProduct.entitlements.some(
			(entitlement) => isResettingEntitlement({ entitlement }),
		);
		if (hasResettingEntitlement) {
			throw new RecaseError({
				message: `dfu.flash: plan '${planContext.plan.plan_id}' has resetting credits but no resolvable billing anchor — provide started_at so resets don't anchor to the import time`,
				code: "started_at_required",
				statusCode: 400,
			});
		}
	}
};
