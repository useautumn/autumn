import type { ProductV2 } from "@autumn/shared";
import type { ComponentProps, ReactNode } from "react";
import { PlanPicker } from "@/components/forms/shared/plan-tray/PlanPicker";
import type { PlanPickerScopeRow } from "@/components/forms/shared/plan-tray/PlanPickerScopeRow";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanOptionStatus } from "./PlanOptionStatus";

/** The shared plan picker, greying out conflicting groups and subscriptions. */
export function CustomerStatePlanPicker({
	products,
	usedKeys,
	siblingProductIds,
	header,
	scope,
	disabled,
	onSelect,
	onDismiss,
}: {
	products: ProductV2[];
	usedKeys: Set<string>;
	siblingProductIds: Set<string>;
	header?: ReactNode;
	scope?: ComponentProps<typeof PlanPickerScopeRow>;
	disabled?: boolean;
	onSelect: (productId: string) => void;
	onDismiss?: () => void;
}) {
	const { shouldOpenPickerImmediately, findSubscriptionConflict } =
		useCustomerStateContext();
	const isGroupUsed = (product: ProductV2) =>
		usedKeys.has(getProductGroupKey({ productId: product.id, products }));
	const subscriptionConflictOf = (product: ProductV2) =>
		findSubscriptionConflict({ product, entityId: scope?.value ?? null });

	return (
		<PlanPicker
			products={products}
			header={header}
			scope={scope}
			disabled={disabled}
			defaultOpen={shouldOpenPickerImmediately()}
			isOptionDisabled={(product) =>
				isGroupUsed(product) || Boolean(subscriptionConflictOf(product))
			}
			renderOptionStatus={(product) => (
				<PlanOptionStatus
					isSelectedElsewhere={siblingProductIds.has(product.id)}
					isGroupUsed={isGroupUsed(product)}
					subscriptionConflict={subscriptionConflictOf(product)}
					productName={product.name}
				/>
			)}
			onSelect={onSelect}
			onDismiss={onDismiss}
		/>
	);
}
