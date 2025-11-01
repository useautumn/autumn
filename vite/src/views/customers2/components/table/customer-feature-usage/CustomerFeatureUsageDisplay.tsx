import { AllowanceType, FeatureType } from "@autumn/shared";
import { PokerChipIcon } from "@phosphor-icons/react";
import { calculateUsageMetrics } from "./calculateUsageMetrics";
import type { CustomerFeatureUsageRowData } from "./customerFeatureUsageTypes";

interface CustomerFeatureUsageDisplayProps {
	featureType: FeatureType;
	allowanceType: AllowanceType;
	allowance: number;
	balance: number;
	quantity: number;
	isSubRow?: boolean;
	creditAmount?: number;
	subRows?: CustomerFeatureUsageRowData[];
}

export function CustomerFeatureUsageDisplay({
	featureType,
	allowanceType,
	allowance,
	balance,
	quantity,
	isSubRow = false,
	creditAmount,
	subRows = [],
}: CustomerFeatureUsageDisplayProps) {
	if (!isSubRow && featureType === FeatureType.Boolean) {
		return null;
	}

	if (allowanceType === AllowanceType.Unlimited) {
		return (
			<div className={isSubRow ? "text-sm text-t3" : "text-t3"}>Unlimited</div>
		);
	}

	if (isSubRow) {
		const { used } = calculateUsageMetrics({
			allowance,
			balance,
			quantity,
		});
		const spent = used * (creditAmount || 0);

		return (
			<div className="text-sm flex items-center gap-1">
				{used} used <PokerChipIcon className="min-w-4" /> {spent} spent
			</div>
		);
	}

	if (featureType === FeatureType.CreditSystem) {
		let totalSpent = 0;

		for (const subRow of subRows) {
			// Only process CreditSystemSubRow items
			if (!("isSubRow" in subRow) || !subRow.isSubRow) continue;

			const meteredCusEnt = subRow.meteredCusEnt;
			const creditCost = subRow.credit_amount;

			if (meteredCusEnt?.entitlement) {
				const subEnt = meteredCusEnt.entitlement;
				if (subEnt.allowance_type !== AllowanceType.Unlimited) {
					const { used } = calculateUsageMetrics({
						allowance: subEnt.allowance || 0,
						balance: meteredCusEnt.balance || 0,
						quantity: meteredCusEnt.customer_product.quantity || 1,
					});
					totalSpent += used * creditCost;
				}
			}
		}

		const total = allowance * quantity;

		return (
			<div className="flex items-center gap-1">
				<PokerChipIcon className="min-w-4" /> {totalSpent}/{total} used
			</div>
		);
	}

	const { total, used } = calculateUsageMetrics({
		allowance,
		balance,
		quantity,
	});

	return (
		<div>
			{used}/{total} used
		</div>
	);
}
