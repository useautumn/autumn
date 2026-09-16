import {
	MigrationItemRunSkipReason,
	type MigrationItemRunSkipReason as MigrationItemRunSkipReasonType,
} from "@autumn/shared";

/** A customer is skipped when no customer product ends up with a change.
 * Products the operations matched but left untouched mean there was nothing
 * to do; none matched at all means the operations could not apply. */
export const resolveSkipReason = ({
	matchedCustomerProducts,
	unchangedCustomerProducts,
}: {
	matchedCustomerProducts: number;
	unchangedCustomerProducts: number;
}): MigrationItemRunSkipReasonType | null => {
	if (matchedCustomerProducts > 0) return null;
	return unchangedCustomerProducts > 0
		? MigrationItemRunSkipReason.NoUpdatesNeeded
		: MigrationItemRunSkipReason.Ineligible;
};
