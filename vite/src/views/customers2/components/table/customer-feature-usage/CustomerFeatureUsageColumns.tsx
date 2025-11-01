// add the edge case where if usage is greater than allowance it's just a red bar

import {
	AllowanceType,
	FeatureType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { CustomerFeatureConfiguration } from "./CustomerFeatureConfiguration";
import { CustomerFeatureResetDate } from "./CustomerFeatureResetDate";
import { CustomerFeatureUsageBar } from "./CustomerFeatureUsageBar";
import { CustomerFeatureUsageDisplay } from "./CustomerFeatureUsageDisplay";

interface SubRowData {
	isSubRow: boolean;
	meteredCusEnt?: FullCusEntWithFullCusProduct;
	feature?: any;
	credit_amount?: number;
}

const getSubRowData = (cusEnt: any): SubRowData | null => {
	if (!cusEnt.isSubRow) return null;
	return {
		isSubRow: true,
		meteredCusEnt: cusEnt.meteredCusEnt,
		feature: cusEnt.feature,
		credit_amount: cusEnt.credit_amount,
	};
};

export const CustomerFeatureUsageColumns = [
	{
		header: "Feature",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let allowance: number;
			let balance: number;
			let quantity: number;
			let featureName: string;
			let className: string | undefined;
			let featureType: FeatureType;

			if (subRowData) {
				// For subrows, calculate progress based on credit spending vs parent's total
				const parentAllowance = cusEnt.entitlement?.allowance ?? 0;
				const parentQuantity = cusEnt.customer_product.quantity || 1;
				const parentTotal = parentAllowance * parentQuantity;

				// Calculate metered feature usage
				const meteredCusEnt = subRowData.meteredCusEnt;
				if (meteredCusEnt?.entitlement) {
					const meteredAllowance =
						meteredCusEnt.entitlement.allowance || 0;
					const meteredQuantity = meteredCusEnt.customer_product.quantity || 1;
					const meteredTotal = meteredAllowance * meteredQuantity;
					const meteredBalance = meteredCusEnt.balance || 0;
					const meteredUsed = meteredTotal - meteredBalance;

					// Calculate credits spent
					const creditAmount = subRowData.credit_amount || 0;
					const creditsSpent = meteredUsed * creditAmount;

					// Use parent's allowance but effective balance based on credits
					allowance = parentAllowance;
					quantity = parentQuantity;
					balance = parentTotal - creditsSpent;
				} else {
					// Fallback if no metered entitlement data
					allowance = cusEnt.entitlement?.allowance ?? 0;
					balance = subRowData.meteredCusEnt?.balance ?? 0;
					quantity = cusEnt.customer_product.quantity || 1;
				}

				featureName = subRowData.feature.name;
				featureType = subRowData.feature.type;
				className = "pl-4";
			} else {
				allowance = cusEnt.entitlement?.allowance ?? 0;
				balance = cusEnt?.balance ?? 0;
				quantity = cusEnt.customer_product.quantity || 1;
				featureName = cusEnt.entitlement.feature.name;
				featureType = cusEnt.entitlement.feature.type;
			}

			// For credit systems, calculate effective balance from subrows
			if (!subRowData && featureType === FeatureType.CreditSystem) {
				const subRows = (cusEnt as any).subRows || [];
				let totalSpent = 0;

				for (const subRow of subRows) {
					const meteredCusEnt = subRow.meteredCusEnt;
					const creditCost = subRow.credit_amount;

					if (meteredCusEnt?.entitlement) {
						const subEnt = meteredCusEnt.entitlement;
						if (subEnt.allowance_type !== AllowanceType.Unlimited) {
							const subTotal =
								subEnt.allowance * (meteredCusEnt.customer_product.quantity || 1);
							const subRemaining = meteredCusEnt.balance || 0;
							const subUsed = subTotal - subRemaining;
							totalSpent += subUsed * creditCost;
						}
					}
				}

				const total = allowance * quantity;
				balance = total - totalSpent;
			}

			const isBoolean = featureType === FeatureType.Boolean;

			return (
				<div className={cn("flex items-center gap-2.5 py-2", className)}>
					{!isBoolean && (
						<CustomerFeatureUsageBar
							allowance={allowance}
							balance={balance}
							quantity={quantity}
						/>
					)}
					<span>{featureName}</span>
				</div>
			);
		},
	},
	{
		header: "Usage",
		accessorKey: "usage",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let featureType: FeatureType;
			let allowanceType: AllowanceType;
			let allowance: number;
			let balance: number;
			let quantity: number;
			let isSubRow: boolean;
			let creditAmount: number | undefined;
			let subRows: any[] | undefined;

			if (subRowData) {
				const { meteredCusEnt, credit_amount } = subRowData;

				if (!meteredCusEnt?.entitlement) {
					return <div className="text-sm text-t3">-</div>;
				}

				featureType = meteredCusEnt.entitlement.feature.type;
				allowanceType = meteredCusEnt.entitlement.allowance_type;
				allowance = meteredCusEnt.entitlement.allowance || 0;
				balance = meteredCusEnt.balance || 0;
				quantity = meteredCusEnt.customer_product.quantity || 1;
				isSubRow = true;
				creditAmount = credit_amount;
			} else {
				featureType = cusEnt.entitlement.feature.type;
				allowanceType = cusEnt.entitlement.allowance_type;
				allowance = cusEnt.entitlement.allowance || 0;
				balance = cusEnt.balance || 0;
				quantity = cusEnt.customer_product.quantity || 1;
				isSubRow = false;
				subRows = (cusEnt as any).subRows;
			}

			return (
				<CustomerFeatureUsageDisplay
					featureType={featureType}
					allowanceType={allowanceType}
					allowance={allowance}
					balance={balance}
					quantity={quantity}
					isSubRow={isSubRow}
					creditAmount={creditAmount}
					subRows={subRows}
				/>
			);
		},
	},
	{
		header: "Resets At",
		accessorKey: "resets_at",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let resetTimestamp: number | null | undefined;

			if (subRowData) {
				resetTimestamp = subRowData.meteredCusEnt?.next_reset_at;
			} else {
				resetTimestamp = cusEnt.next_reset_at;
			}

			return <CustomerFeatureResetDate resetTimestamp={resetTimestamp} />;
		},
	},
	{
		header: "Configuration",
		accessorKey: "configuration",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let feature: any;

			if (subRowData) {
				feature = subRowData.feature;
			} else {
				feature = cusEnt.entitlement.feature;
			}

			return <CustomerFeatureConfiguration feature={feature} />;
		},
	},
	{
		id: "expander",
		header: "",
		size: 40,
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const cusEnt = row.original;
			const canExpand = row.getCanExpand();
			const isExpanded = row.getIsExpanded();
			const isSubRow = "isSubRow" in cusEnt && cusEnt.isSubRow;

			if (isSubRow || !canExpand) {
				return <div className="w-0" />;
			}

			return (
				<div className="flex justify-end pr-4">
					<button
						type="button"
						onClick={row.getToggleExpandedHandler()}
						className="text-t3 hover:text-t2"
					>
						{isExpanded ? (
							<CaretDownIcon size={16} weight="bold" />
						) : (
							<CaretRightIcon size={16} weight="bold" />
						)}
					</button>
				</div>
			);
		},
	},
];
