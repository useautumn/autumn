import {
	type CheckCommand,
	computeCheck,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	type BalancesLimitReached,
	customerToSvixTags,
	WebhookEventType,
} from "@autumn/shared";
import type { BalanceWebhook } from "../types/balanceWebhook.js";
import { findBlockingUsageLimit } from "./findBlockingUsageLimit.js";

/** Fires when the feature went from allowed to refused: what prod's checkLimitReached sends, decided from the log alone. */
export const checkLimitReached = ({
	command,
	before,
	after,
}: {
	command: CheckCommand;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): BalanceWebhook[] => {
	const wasAllowed = computeCheck({ fullSubject: before, command }).allowed;
	if (!wasAllowed) return [];
	const now = computeCheck({ fullSubject: after, command });
	if (now.allowed) return [];

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
			eventType: WebhookEventType.BalancesLimitReached,
			data,
			tags: customerToSvixTags({ customerId, entityId }),
		},
	];
};
