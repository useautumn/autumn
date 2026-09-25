import {
	type BalanceWebhookEffect,
	type CheckCommand,
	checkRefusedByDeduction,
	type DeductionOutcome,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	type BalancesLimitReached,
	customerToSvixTags,
	WebhookEventType,
} from "@autumn/shared";
import { findBlockingUsageLimit } from "./findBlockingUsageLimit.js";

/** Fires when the deduction took the feature from allowed to refused: what prod's checkLimitReached sends, decided from the log alone. */
export const checkLimitReached = ({
	command,
	before,
	after,
	deduction,
}: {
	command: CheckCommand;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
	deduction: DeductionOutcome;
}): BalanceWebhookEffect[] => {
	const refused = checkRefusedByDeduction({
		fullSubject: before,
		command,
		deduction,
	});
	if (!refused) return [];

	const { customerId, entityId } = command.identity;
	const limitType = refused.limitType ?? "included";

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
