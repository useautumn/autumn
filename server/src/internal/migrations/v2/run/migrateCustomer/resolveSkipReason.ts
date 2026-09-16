import { MigrationItemRunSkipReason } from "@autumn/shared";

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
