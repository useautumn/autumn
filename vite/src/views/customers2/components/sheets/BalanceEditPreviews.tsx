import {
	BillWhen,
	EntInterval,
	FeatureUsageType,
	type FullCustomerPrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export function BalanceEditPreviews({
	cusPrice,
	interval,
	featureUsageType,
	currentBalance,
}: {
	cusPrice: FullCustomerPrice | undefined;
	interval: EntInterval | null | undefined;
	featureUsageType: FeatureUsageType | undefined;
	currentBalance: number | null;
}) {
	const isLifetime = interval === EntInterval.Lifetime;
	const isContinuousUse = featureUsageType === FeatureUsageType.Continuous;
	const isPayPerUse =
		(cusPrice?.price.config as UsagePriceConfig)?.bill_when ===
		BillWhen.EndOfPeriod;

	const showChargeWarning =
		isContinuousUse &&
		isPayPerUse &&
		currentBalance !== null &&
		currentBalance < 0;

	console.log("currentBalance", currentBalance);

	if (showChargeWarning) {
		return (
			<InfoBox variant="warning" classNames={{ infoBox: "text-sm p-2" }}>
				Changing balances for this feature will charge your customer.
			</InfoBox>
		);
	}

	if (isLifetime) {
		return (
			<InfoBox classNames={{ infoBox: "text-sm p-2" }}>
				Lifetime balances have no reset date.
			</InfoBox>
		);
	}

	if (cusPrice) {
		return (
			<InfoBox classNames={{ infoBox: "text-sm p-2" }}>
				Reset cycle cannot be changed for paid features, as it follows the
				billing cycle.
			</InfoBox>
		);
	}

	return null;
}
