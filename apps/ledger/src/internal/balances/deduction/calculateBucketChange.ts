import type { SubjectBalance } from "../types/subjectBalance.js";
import type { DeductionBucket } from "./types/deductionBucket.js";

// Positive = deducted, negative = added — the sign convention of the script's
// calculate_change (deductFromMainBalanceV2.lua:22-70).
const deductToFloor = ({
	balance,
	amount,
	floor,
}: {
	balance: number;
	amount: number;
	floor: number;
}): number => Math.max(0, Math.min(amount, balance - floor));

const refundToCeiling = ({
	balance,
	amount,
	ceiling,
}: {
	balance: number;
	amount: number;
	ceiling: number;
}): number => {
	const addable = Math.min(-amount, Math.max(0, ceiling - balance));
	// Negating a zero would yield -0, which reads oddly in the mutation log.
	return addable === 0 ? 0 : -addable;
};

export const calculateBucketChange = ({
	bucket,
	balance,
	amount,
}: {
	bucket: DeductionBucket;
	balance: SubjectBalance;
	amount: number;
}): number => {
	switch (bucket.kind) {
		case "spend_included":
			return deductToFloor({ balance: balance.balance, amount, floor: 0 });
		case "spend_overage":
			return bucket.limit === null
				? amount
				: deductToFloor({
						balance: balance.balance,
						amount,
						floor: bucket.limit,
					});
		case "refund_overage":
			return refundToCeiling({ balance: balance.balance, amount, ceiling: 0 });
		case "refund_included":
			return bucket.limit === null
				? amount
				: refundToCeiling({
						balance: balance.balance,
						amount,
						ceiling: bucket.limit + balance.adjustment,
					});
		case "unlimited":
			return amount;
	}
};
