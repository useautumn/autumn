import { AllowanceType, type Feature, FeatureType } from "@autumn/shared";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { CustomerFeatureConfiguration } from "./CustomerFeatureConfiguration";
import { CustomerFeatureResetDate } from "./CustomerFeatureResetDate";
import { CustomerFeatureUsageBar } from "./CustomerFeatureUsageBar";
import { CustomerFeatureUsageDisplay } from "./CustomerFeatureUsageDisplay";
import type {
	CreditSystemSubRow,
	CustomerFeatureUsageRowData,
	FullCusEntWithSubRows,
} from "./customerFeatureUsageTypes";

const getSubRowData = (
	cusEnt: CustomerFeatureUsageRowData,
): CreditSystemSubRow | null => {
	if (!("isSubRow" in cusEnt) || !cusEnt.isSubRow) return null;
	return cusEnt;
};

export const CustomerFeatureUsageColumns = [
	{
		header: "Feature",
		cell: ({ row }: { row: Row<CustomerFeatureUsageRowData> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let allowance: number;
			let balance: number;
			let quantity: number;
			let featureName: string;
			let className: string | undefined;
			let featureType: FeatureType;

			if (subRowData) {
				const parentAllowance = subRowData.entitlement?.allowance ?? 0;
				const parentQuantity = subRowData.customer_product?.quantity || 1;
				const parentTotal = parentAllowance * parentQuantity;

				const meteredCusEnt = subRowData.meteredCusEnt;
				if (meteredCusEnt?.entitlement) {
					const meteredAllowance = meteredCusEnt.entitlement.allowance || 0;
					const meteredQuantity = meteredCusEnt.customer_product?.quantity || 1;
					const meteredTotal = meteredAllowance * meteredQuantity;
					const meteredBalance = meteredCusEnt.balance || 0;
					const meteredUsed = meteredTotal - meteredBalance;

					const creditAmount = subRowData.credit_amount || 0;
					const creditsSpent = meteredUsed * creditAmount;

					allowance = parentAllowance;
					quantity = parentQuantity;
					balance = parentTotal - creditsSpent;
				} else {
					allowance = subRowData.entitlement?.allowance ?? 0;
					balance = subRowData.meteredCusEnt?.balance ?? 0;
					quantity = subRowData.customer_product?.quantity || 1;
				}

				featureName = subRowData.feature?.name ?? "";
				featureType = subRowData.feature?.type ?? FeatureType.Boolean;
				className = "pl-4";
			} else {
				const parentEnt = cusEnt as FullCusEntWithSubRows;
				allowance = parentEnt.entitlement?.allowance || 0;
				balance = parentEnt?.balance || 0;
				quantity = parentEnt.customer_product?.quantity || 1;
				featureName = parentEnt.entitlement.feature?.name || "";
				featureType =
					parentEnt.entitlement.feature?.type || FeatureType.Boolean;
			}

			if (!subRowData && featureType === FeatureType.CreditSystem) {
				const subRows = (cusEnt as FullCusEntWithSubRows).subRows || [];
				let totalSpent = 0;

				for (const subRow of subRows) {
					if (!("isSubRow" in subRow) || !subRow.isSubRow) continue;

					const meteredCusEnt = subRow.meteredCusEnt;
					const creditCost = subRow.credit_amount;

					if (meteredCusEnt?.entitlement) {
						const subEnt = meteredCusEnt.entitlement;
						if (subEnt.allowance_type !== AllowanceType.Unlimited) {
							const subTotal =
								(subEnt.allowance || 0) *
								(meteredCusEnt.customer_product?.quantity || 1);
							const subRemaining = meteredCusEnt.balance || 0;
							const subUsed = subTotal - subRemaining;
							totalSpent += subUsed * creditCost;
						}
					}
				}

				const total = allowance * quantity;
				balance = total - totalSpent;
			}

			return (
				<div className={cn("flex items-center gap-2.5 py-2", className)}>
					<CustomerFeatureUsageBar
						allowance={allowance}
						balance={balance}
						quantity={quantity}
					/>
					<span>{featureName}</span>
				</div>
			);
		},
	},
	{
		header: "Usage",
		accessorKey: "usage",
		cell: ({ row }: { row: Row<CustomerFeatureUsageRowData> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let featureType: FeatureType;
			let allowanceType: AllowanceType;
			let allowance: number;
			let balance: number;
			let quantity: number;
			let isSubRow: boolean;
			let creditAmount: number | undefined;
			let subRows: CustomerFeatureUsageRowData[] | undefined;

			if (subRowData) {
				const { meteredCusEnt, credit_amount } = subRowData;

				if (!meteredCusEnt?.entitlement) {
					return <div className="text-sm text-t3">-</div>;
				}

				featureType = meteredCusEnt.entitlement.feature.type;
				allowanceType =
					meteredCusEnt.entitlement.allowance_type || AllowanceType.Unlimited;
				allowance = meteredCusEnt.entitlement.allowance || 0;
				balance = meteredCusEnt.balance || 0;
				quantity = meteredCusEnt.customer_product?.quantity || 1;
				isSubRow = true;
				creditAmount = credit_amount;
			} else {
				// Not a subrow, so cusEnt is FullCusEntWithSubRows
				const parentEnt = cusEnt as FullCusEntWithSubRows;
				featureType = parentEnt.entitlement.feature.type;
				allowanceType =
					parentEnt.entitlement.allowance_type || AllowanceType.Unlimited;
				allowance = parentEnt.entitlement.allowance || 0;
				balance = parentEnt.balance || 0;
				quantity = parentEnt.customer_product?.quantity || 1;
				isSubRow = false;
				subRows = parentEnt.subRows;
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
		cell: ({ row }: { row: Row<CustomerFeatureUsageRowData> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let resetTimestamp: number | null | undefined;

			if (subRowData) {
				resetTimestamp = subRowData.meteredCusEnt?.next_reset_at;
			} else {
				const parentEnt = cusEnt as FullCusEntWithSubRows;
				resetTimestamp = parentEnt.next_reset_at;
			}

			return <CustomerFeatureResetDate resetTimestamp={resetTimestamp} />;
		},
	},
	{
		header: "Configuration",
		accessorKey: "configuration",
		cell: ({ row }: { row: Row<CustomerFeatureUsageRowData> }) => {
			const cusEnt = row.original;
			const subRowData = getSubRowData(cusEnt);
			let feature: Feature | undefined;

			if (subRowData) {
				feature = subRowData.feature;
			} else {
				const parentEnt = cusEnt as FullCusEntWithSubRows;
				feature = parentEnt.entitlement.feature;
			}

			return <CustomerFeatureConfiguration feature={feature} />;
		},
	},
	{
		id: "expander",
		header: "",
		size: 40,
		cell: ({ row }: { row: Row<CustomerFeatureUsageRowData> }) => {
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
						onClick={(e) => {
							e.stopPropagation();
							row.getToggleExpandedHandler()(e);
						}}
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
