import { RecaseError } from "@autumn/shared";
import type { FlashContext } from "../setup/setupFlashContext";

const rejectUnsupported = (message: string): never => {
	throw new RecaseError({
		message: `billing.import: ${message} is not yet supported`,
		code: "unsupported_field",
		statusCode: 400,
	});
};

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

	const hasStripeRecurringBase = planContexts.some(
		(pc) => pc.processor === "stripe" && !pc.isAddOn && pc.isRecurring,
	);
	const hasRevenuecatRecurringBase = planContexts.some(
		(pc) => pc.processor === "revenuecat" && !pc.isAddOn && pc.isRecurring,
	);
	if (hasStripeRecurringBase && hasRevenuecatRecurringBase) {
		throw new RecaseError({
			message:
				"billing.import: a recurring Stripe base plan and a recurring RevenueCat base plan cannot be flashed together",
			code: "cross_processor_conflict",
			statusCode: 400,
		});
	}
};
