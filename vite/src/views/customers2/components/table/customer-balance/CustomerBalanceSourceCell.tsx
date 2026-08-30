import type {
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { CustomerBalanceBillingIcon } from "./CustomerBalanceBillingIcon";
import { getCustomerBalanceSourceParts } from "./customerBalanceUtils";

export function CustomerBalanceSourceCell({
	balance,
	entities,
	fullCustomer,
}: {
	balance: FullCusEntWithFullCusProduct;
	entities: Entity[];
	fullCustomer?: FullCustomer | null;
}) {
	const { productName, intervalLabel, entityName } =
		getCustomerBalanceSourceParts({ balance, entities, fullCustomer });
	const hasPlan = productName !== "No plan";
	const metaParts = [intervalLabel, entityName].filter(Boolean).join(" · ");

	if (!hasPlan) {
		return (
			<div className="flex items-center gap-2 min-w-0">
				<CustomerBalanceBillingIcon balance={balance} />
				<AdminHover
					texts={getCusEntHoverTexts({
						cusEnt: balance,
						entities,
					})}
				>
					<span className="text-tertiary-foreground truncate text-xs">
						{metaParts}
					</span>
				</AdminHover>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0.5 min-w-0">
			<div className="flex items-center gap-2">
				<CustomerBalanceBillingIcon balance={balance} />
				<AdminHover
					texts={getCusEntHoverTexts({
						cusEnt: balance,
						entities,
					})}
				>
					<span className="text-foreground text-xs font-medium truncate">
						{productName}
					</span>
				</AdminHover>
			</div>
			<span className="text-tertiary-foreground text-xs truncate pl-5.5">
				{metaParts}
			</span>
		</div>
	);
}
