import {
	type Entity,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	isCusEntDisplayExpired,
	isSyntheticPooledBalanceCustomerEntitlement,
} from "@autumn/shared";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { cn } from "@/lib/utils";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { CustomerBalanceSourceCell } from "./CustomerBalanceSourceCell";
import type { CustomerBalanceRowData } from "./CustomerBalanceTable";
import { getCustomerBalancePlanName } from "./customerBalanceUtils";

export function CustomerBalanceFeatureCell({
	row,
	entities,
	fullCustomer,
}: {
	row: Row<CustomerBalanceRowData>;
	entities: Entity[];
	fullCustomer?: FullCustomer | null;
}) {
	const balance = row.original;

	if (row.depth > 0) {
		return (
			<CustomerBalanceSourceCell
				balance={balance}
				entities={entities}
				fullCustomer={fullCustomer}
			/>
		);
	}

	const canExpand = row.getCanExpand();
	const planName = getParentRowPlanName({
		balance,
		canExpand,
		fullCustomer,
	});

	return (
		<div
			className={cn(
				"flex items-center gap-2 min-w-0",
				isCusEntDisplayExpired({ cusEnt: balance }) && "opacity-50",
			)}
		>
			{canExpand && (
				<span
					className={cn(
						"inline-flex text-tertiary-foreground transition-transform duration-200",
						row.getIsExpanded() && "rotate-90",
					)}
				>
					<CaretRightIcon size={14} weight="bold" />
				</span>
			)}
			<AdminHover
				texts={getCusEntHoverTexts({
					cusEnt: balance,
					entities,
				})}
			>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-medium text-foreground truncate">
						{balance.entitlement.feature.name}
					</span>
					{planName && (
						<span className="text-tertiary-foreground text-xs truncate">
							{planName}
						</span>
					)}
				</div>
			</AdminHover>
		</div>
	);
}

const getParentRowPlanName = ({
	balance,
	canExpand,
	fullCustomer,
}: {
	balance: FullCusEntWithFullCusProduct;
	canExpand: boolean;
	fullCustomer?: FullCustomer | null;
}) => {
	if (canExpand) return undefined;
	if (
		!isSyntheticPooledBalanceCustomerEntitlement({
			customerEntitlement: balance,
		})
	) {
		return undefined;
	}

	return getCustomerBalancePlanName({ balance, fullCustomer });
};
