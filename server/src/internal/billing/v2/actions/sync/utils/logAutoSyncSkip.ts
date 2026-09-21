import type { AutoSyncRejectionReason } from "../canAutoSync/types.js";
import type { IncrementalSyncSkipReason } from "../scope/buildIncrementalSyncParams.js";

type AutoSyncSkipReason = AutoSyncRejectionReason | IncrementalSyncSkipReason;

type SkipLogger = {
	info: (message: string, fields: object) => void;
	warn: (message: string, fields: object) => void;
};

/** Skips where Stripe held nothing for Autumn to apply. */
const ROUTINE_SKIP_REASONS = new Set<AutoSyncSkipReason>([
	"no_matched_plans",
	"no_changed_targets",
]);

/** Every other skip leaves a Stripe change unapplied, so it warns with a
 * filterable `skip_reason` instead of drifting silently. */
export const logAutoSyncSkip = ({
	logger,
	source,
	stripeSubscriptionId,
	stripeScheduleId,
	reason,
	details,
}: {
	logger: SkipLogger;
	source: "sub.created" | "sub.updated" | "customer.create";
	stripeSubscriptionId: string | null;
	stripeScheduleId?: string | null;
	reason: AutoSyncSkipReason;
	details?: string;
}) => {
	const message = `${source} auto-sync skipping ${stripeSubscriptionId ?? stripeScheduleId}: ${reason}${details ? ` - ${details}` : ""}`;
	const fields = {
		data: {
			type: "stripe_auto_sync_skip",
			source,
			stripe_subscription_id: stripeSubscriptionId,
			...(stripeScheduleId ? { stripe_schedule_id: stripeScheduleId } : {}),
			skip_reason: reason,
		},
	};

	if (ROUTINE_SKIP_REASONS.has(reason)) {
		logger.info(message, fields);
		return;
	}
	logger.warn(message, fields);
};
