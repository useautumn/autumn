import {
	type FullCusEntWithFullCusProduct,
	isBooleanEntitlement,
	isCustomerProductOneOff,
	isLifetimeEntitlement,
} from "@autumn/shared";
import { DropdownMenuItem } from "@autumn/ui";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSyncCustomerEntitlementAnchors } from "./useSyncCustomerEntitlementAnchors";

export function AdminSyncAnchorMenuItem({
	customerEntitlements,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
}) {
	const { isAdmin } = useAdmin();
	const { mutate, isPending } = useSyncCustomerEntitlementAnchors();
	const canSyncAnchor = customerEntitlements.some(
		(customerEntitlement) =>
			!!customerEntitlement.customer_product &&
			!isCustomerProductOneOff(customerEntitlement.customer_product) &&
			!isBooleanEntitlement({
				entitlement: customerEntitlement.entitlement,
			}) &&
			!isLifetimeEntitlement({
				entitlement: customerEntitlement.entitlement,
			}),
	);

	if (!isAdmin || !canSyncAnchor) return null;

	return (
		<DropdownMenuItem
			disabled={isPending}
			onClick={(event) => {
				event.stopPropagation();
				mutate({
					customerEntitlementIds: customerEntitlements.map(
						(customerEntitlement) => customerEntitlement.id,
					),
				});
			}}
		>
			<div className="flex w-full items-center justify-between gap-2 text-sm">
				Sync anchor
				<ArrowsClockwiseIcon size={12} className="text-tertiary-foreground" />
			</div>
		</DropdownMenuItem>
	);
}
