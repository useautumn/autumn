import { MigrationItemRunSkipReason } from "@autumn/shared";

/** Nothing changed: matched-but-unchanged products mean nothing to do,
 * no matched products mean the operations could not apply. */
export const resolveSkipReason = ({
	matchedCustomerProducts,
	unchangedCustomerProducts,
}: {
	matchedCustomerProducts: number;
	unchangedCustomerProducts: number;
}): MigrationItemRunSkipReason | null => {
	if (matchedCustomerProducts > 0) return null;
	return unchangedCustomerProducts > 0
		? MigrationItemRunSkipReason.NoUpdatesNeeded
		: MigrationItemRunSkipReason.Ineligible;
};
