import {
	type BalanceWebhookEffect,
	type CheckCommand,
	checkAfterDeduction,
	type DeductionOutcome,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	type BalancesLimitReached,
	customerToSvixTags,
	WebhookEventType,
} from "@autumn/shared";
import { findBlockingUsageLimit } from "./findBlockingUsageLimit.js";

/** Fires when the feature went from allowed to refused: what prod's checkLimitReached sends, decided from the log alone. */
export const checkLimitReached = ({
	command,
	outcome,
	before,
	after,
}: {
	command: CheckCommand;
	outcome: DeductionOutcome;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): BalanceWebhookEffect[] => {
	// Drawn on the deduction's own rows; almost every track leaves the feature allowed, so `before` is rarely read.
	const check = checkAfterDeduction({ fullSubject: before, command, outcome });
	const now = check.after;
	if (now.allowed) return [];
	if (!check.before().allowed) return [];

	const { customerId, entityId } = command.identity;
	const limitType = now.limitType ?? "included";

	// A windowed cap is named in full, its live window and filter with it, so the receiver knows which one closed.
	const blockingUsageLimit =
		limitType === "usage_limit"
			? findBlockingUsageLimit({ command, fullSubject: after })
			: null;

	const data: BalancesLimitReached = {
		customer_id: customerId,
		feature_id: command.featureId,
		limit_type: limitType,
		...(entityId ? { entity_id: entityId } : {}),
		...blockingUsageLimit,
	};

	return [
		{
			type: "balance_webhook",
			eventType: WebhookEventType.BalancesLimitReached,
			data,
			tags: customerToSvixTags({ customerId, entityId }),
		},
	];
};
