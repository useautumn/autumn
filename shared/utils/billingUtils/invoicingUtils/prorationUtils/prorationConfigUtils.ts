import { OnDecrease, OnIncrease } from "@autumn/shared";

export const shouldCreateInvoiceItem = (onIncrease: OnIncrease) => {
	return (
		onIncrease === OnIncrease.BillImmediately ||
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnIncrease.ProrateNextCycle
	);
};

export const shouldBillNow = (onIncrease: OnIncrease | OnDecrease) => {
	return (
		onIncrease === OnIncrease.BillImmediately ||
		onIncrease === OnIncrease.ProrateImmediately ||
		onIncrease === OnDecrease.ProrateImmediately
	);
};

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

export const shouldSkipLineItems = (
	prorationConfig: OnIncrease | OnDecrease,
) => {
	return (
		prorationConfig === OnDecrease.NoProrations ||
		prorationConfig === OnDecrease.None ||
		prorationConfig === OnIncrease.BillNextCycle
	);
};

export const shouldCreateReplaceables = (
	prorationConfig: OnIncrease | OnDecrease,
) => {
	return prorationConfig === OnDecrease.None;
};
