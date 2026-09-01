import { Decimal } from "decimal.js";
import type { DeductionBucket } from "../types/deductionBucket.js";

// Positive = deducted. Refund kinds will return negative changes when they
// join the union.
export const calculateBucketChange = ({
	bucket,
	balance,
	amount,
}: {
	bucket: DeductionBucket;
	balance: Decimal;
	amount: Decimal;
}): Decimal => {
	switch (bucket.kind) {
		case "spend_included":
			return Decimal.min(
				amount,
				Decimal.max(balance.minus(bucket.limit ?? 0), 0),
			);
		case "spend_overage":
			return bucket.limit === null
				? amount
				: Decimal.min(amount, Decimal.max(balance.minus(bucket.limit), 0));
	}
};
