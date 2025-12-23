import { OnDecrease, OnIncrease } from "@autumn/shared";

/**
 * Determines if an invoice item should be created for a quantity increase.
 * @param onIncrease - The proration behavior configuration for the quantity increase.
 * @returns True if an invoice item should be created, false otherwise.
 */
export const shouldCreateInvoiceItem = (onIncrease: OnIncrease) => {
	return (
		onIncrease === OnIncrease.BillImmediately ||
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnIncrease.ProrateNextCycle
	);
};

/**
 * Determines if an invoice item should be billed immediately.
 * @param onIncrease - The proration behavior configuration for the quantity increase.
 * @returns True if an invoice item should be billed immediately, false otherwise.
 */
export const shouldBillNow = (onIncrease: OnIncrease | OnDecrease) => {
	return (
		onIncrease === OnIncrease.BillImmediately ||
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnDecrease.ProrateImmediately
	);
};

/**
 * Determines if a quantity downgrade should be prorated.
 * @param onIncrease - The proration behavior configuration for the quantity increase.
 * @param onDecrease - The proration behavior configuration for the quantity decrease.
 * @returns True if a quantity downgrade should be prorated, false otherwise.
 */
export const shouldProrateDowngradeNow = ({
	onIncrease,
	onDecrease,
}: {
	onIncrease: OnIncrease;
	onDecrease: OnDecrease;
}) => {
	if (
		onDecrease === OnDecrease.NoProrations ||
		onDecrease === OnDecrease.None
	) {
		return false;
	}

	return (
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnIncrease.BillImmediately
	);
};

/**
 * Determines if a quantity upgrade or downgrade should be prorated.
 * @param onIncrease - The proration behavior configuration for the quantity increase.
 * @returns True if a quantity upgrade or downgrade should be prorated, false otherwise.
 */
export const shouldProrate = (onIncrease?: OnIncrease | OnDecrease) => {
	if (!onIncrease) {
		return true;
	}

	return (
		onIncrease === OnIncrease.ProrateNextCycle ||
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnDecrease.ProrateImmediately ||
		onIncrease === OnDecrease.ProrateNextCycle
	);
};
