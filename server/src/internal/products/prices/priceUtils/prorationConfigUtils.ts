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
