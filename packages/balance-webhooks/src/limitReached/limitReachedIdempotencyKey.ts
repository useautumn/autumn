import type { BalancesLimitReached } from "@autumn/shared";
import { usageLimitFilterKey } from "@autumn/shared";

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
