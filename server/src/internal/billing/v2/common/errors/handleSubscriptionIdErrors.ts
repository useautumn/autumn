import { ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

const presentSubscriptionIds = (
	subscriptionIds: (string | undefined | null)[],
): string[] => subscriptionIds.filter((id): id is string => !!id);

/** Rejects a subscription_id repeated within one set of requested plans. */
export const assertNoDuplicateSubscriptionIds = ({
	subscriptionIds,
}: {
	subscriptionIds: (string | undefined | null)[];
}) => {
	const seen = new Set<string>();
	for (const id of presentSubscriptionIds(subscriptionIds)) {
		if (seen.has(id)) {
			throw new RecaseError({
				message: `Duplicate subscription_id '${id}' in the same request`,
				code: ErrCode.DuplicateSubscriptionId,
				statusCode: 400,
			});
		}
		seen.add(id);
	}
};

export const throwSubscriptionIdInUse = ({
	subscriptionId,
}: {
	subscriptionId: string | null;
}): never => {
	throw new RecaseError({
		message: `subscription_id '${subscriptionId}' is already in use for this customer`,
		code: ErrCode.DuplicateSubscriptionId,
		statusCode: 409,
	});
};

/** Validates that a subscription_id is not already in use for the given customer. */
export const handleSubscriptionIdErrors = async ({
	db,
	internalCustomerId,
	subscriptionIds: rawSubscriptionIds,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	subscriptionIds: (string | undefined | null)[];
}) => {
	const subscriptionIds = presentSubscriptionIds(rawSubscriptionIds);
	if (subscriptionIds.length === 0) return;

	assertNoDuplicateSubscriptionIds({ subscriptionIds });

	const existing = await customerProductRepo.getByExternalIds({
		db,
		internalCustomerId,
		externalIds: subscriptionIds,
	});

	if (existing.length > 0) {
		throwSubscriptionIdInUse({ subscriptionId: existing[0].external_id });
	}
};
