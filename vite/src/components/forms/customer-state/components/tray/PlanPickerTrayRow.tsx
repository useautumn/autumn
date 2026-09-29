import type { ReactNode } from "react";
import type {
	CustomerStatePlan,
	PlanLocation,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	filterUnarchivedProducts,
	getSiblingProductIds,
} from "@/components/forms/customer-state/customerStateUtils";
import { cn } from "@/lib/utils";
import { useCustomerStateContext } from "../../CustomerStateProvider";
import { CustomerStatePlanPicker } from "../CustomerStatePlanPicker";

export function PlanPickerTrayRow({
	location,
	plan,
	plans,
	usedKeys,
	header,
	disabled,
	onDismiss,
}: {
	location: PlanLocation;
	plan: CustomerStatePlan;
	plans: CustomerStatePlan[];
	usedKeys: Set<string>;
	header?: ReactNode;
	disabled?: boolean;
	onDismiss: () => void;
}) {
	const { products, handleSelectPlanProduct, handleSelectPlanScope } =
		useCustomerStateContext();

	return (
		<div className={cn("min-w-0", disabled && "opacity-60")}>
			<CustomerStatePlanPicker
				scope={{
					value: plan.entityId ?? null,
					onChange: (entityId) => handleSelectPlanScope({ location, entityId }),
				}}
				products={filterUnarchivedProducts({ products })}
				usedKeys={usedKeys}
				siblingProductIds={getSiblingProductIds({
					plans,
					planIndex: location.planIndex,
				})}
				header={header}
				disabled={disabled}
				onSelect={(productId) =>
					handleSelectPlanProduct({ location, productId })
				}
				onDismiss={onDismiss}
			/>
		</div>
	);
}
