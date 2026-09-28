import type { BalancesLimitReached } from "@autumn/shared";
import { usageLimitFilterKey } from "@autumn/shared";

/**
 * One key per crossing: the command that took the feature from allowed to refused names it, so a record
 * landed twice sends once, while the next crossing after a reset (a new command) sends again.
 */
export const buildLimitReachedIdempotencyKey = ({
	orgId,
	env,
	customerId,
	entityId,
	featureId,
	limitType,
	filter,
	commandId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId: string | null | undefined;
	featureId: string;
	limitType: BalancesLimitReached["limit_type"];
	filter: BalancesLimitReached["filter"] | undefined;
	commandId: string;
}): string =>
	[
		"limit_reached",
		orgId,
		env,
		customerId,
		entityId ?? "_",
		featureId,
		limitType,
		usageLimitFilterKey(filter) || "_",
		commandId,
	].join(":");
