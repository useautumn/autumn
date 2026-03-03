import { ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

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
	const subscriptionIds = rawSubscriptionIds.filter(
		(id): id is string => !!id,
	);
	if (subscriptionIds.length === 0) return;

	// Check for duplicates within the request itself
	const seen = new Set<string>();
	for (const id of subscriptionIds) {
		if (seen.has(id)) {
			throw new RecaseError({
				message: `Duplicate subscription_id '${id}' in the same request`,
				code: ErrCode.DuplicateSubscriptionId,
				statusCode: 400,
			});
		}
		seen.add(id);
	}

	// Check for existing subscription IDs in the database
	const existing = await customerProductRepo.getByExternalIds({
		db,
		internalCustomerId,
		externalIds: subscriptionIds,
	});

	if (existing.length > 0) {
		throw new RecaseError({
			message: `subscription_id '${existing[0].external_id}' is already in use for this customer`,
			code: ErrCode.DuplicateSubscriptionId,
			statusCode: 409,
		});
	}
};
