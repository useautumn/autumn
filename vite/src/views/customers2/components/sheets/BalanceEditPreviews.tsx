import {
	BillWhen,
	EntInterval,
	FeatureUsageType,
	type FullCustomerPrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { ReactNode } from "react";
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
		isContinuousUse && isPayPerUse && currentBalance && currentBalance < 0;

	const renderInfoBoxes = (): ReactNode[] => {
		const boxes: ReactNode[] = [];

		if (showChargeWarning) {
			boxes.push(
				<InfoBox key="charge-warning" variant="warning">
					This feature has a usage-based price. Updating balances will charge
					them.
				</InfoBox>,
			);
		}

		if (isLifetime) {
			boxes.push(
				<InfoBox key="lifetime" variant="note">
					Lifetime balances have no reset date.
				</InfoBox>,
			);
		}

		if (cusPrice && !isLifetime) {
			boxes.push(
				<InfoBox key="paid-feature" variant="note">
					Reset cycle cannot be changed for paid features, as it follows the
					billing cycle.
				</InfoBox>,
			);
		}

		return boxes;
	};

	const infoBoxes = renderInfoBoxes();

	if (infoBoxes.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			{infoBoxes.map((box, index) => (
				<div key={index}>{box}</div>
			))}
		</div>
	);
}
