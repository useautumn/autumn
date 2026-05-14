import { ResetInterval, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";

export const prepaidWordsWithMaxPurchase = ({
	maxPurchase,
}: {
	maxPurchase: number;
}) => {
	const item = itemsV2.prepaidWords();
	return {
		...item,
		price: {
			...item.price,
			max_purchase: maxPurchase,
		},
	};
};

export const rolloverCredits = ({ max = 100 }: { max?: number } = {}) => ({
	feature_id: TestFeature.Credits,
	included: 50,
	reset: { interval: ResetInterval.Month },
	rollover: {
		max,
		expiry_duration_type: RolloverExpiryDurationType.Month,
		expiry_duration_length: 2,
	},
});
