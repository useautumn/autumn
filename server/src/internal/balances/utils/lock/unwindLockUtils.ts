import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import type { LockReceipt } from "./fetchLockReceipt";

export const calculateLockValue = ({ items }: { items: MutationLogItem[] }) => {
	return items.reduce((lockValue, item) => lockValue + item.value_delta, 0);
};

export const calculateUnwindValue = ({
	receipt,
	finalValue,
}: {
	receipt: LockReceipt;
	finalValue: number;
}) => {
	const lockValue = calculateLockValue({
		items: receipt.items,
	});

	const lockMagnitude = Math.abs(lockValue);
	const finalMagnitude = Math.abs(finalValue);

	if (lockValue === 0) {
		return {
			unwindValue: 0,
			additionalValue: finalValue,
		};
	}

	if (finalValue === 0) {
		return {
			unwindValue: lockMagnitude,
			additionalValue: 0,
		};
	}

	const lockSign = lockValue > 0 ? 1 : -1;
	const finalSign = finalValue > 0 ? 1 : -1;

	if (lockSign !== finalSign) {
		return {
			unwindValue: lockMagnitude,
			additionalValue: finalValue,
		};
	}

	if (finalMagnitude >= lockMagnitude) {
		return {
			unwindValue: 0,
			additionalValue: finalValue - lockValue,
		};
	}

	return {
		unwindValue: lockMagnitude - finalMagnitude,
		additionalValue: 0,
	};
};
