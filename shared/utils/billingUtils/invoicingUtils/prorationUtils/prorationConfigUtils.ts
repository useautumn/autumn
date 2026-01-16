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
 * @param prorationConfig - The proration behavior configuration.
 * @returns True if proration should be applied, false otherwise.
 */
export const shouldProrate = (prorationConfig?: OnIncrease | OnDecrease) => {
	if (!prorationConfig) {
		return true;
	}

	return (
		prorationConfig === OnIncrease.ProrateNextCycle ||
		prorationConfig === OnIncrease.ProrateImmediately ||
		prorationConfig === OnDecrease.ProrateImmediately ||
		prorationConfig === OnDecrease.ProrateNextCycle
	);
};

/**
 * Determines if line items should be skipped entirely (no charge or refund).
 * @param prorationConfig - The proration behavior configuration.
 * @returns True if line items should be skipped, false otherwise.
 */
export const shouldSkipLineItems = (
	prorationConfig: OnIncrease | OnDecrease,
) => {
	return (
		prorationConfig === OnDecrease.NoProrations ||
		prorationConfig === OnDecrease.None ||
		prorationConfig === OnIncrease.BillNextCycle
	)
};
