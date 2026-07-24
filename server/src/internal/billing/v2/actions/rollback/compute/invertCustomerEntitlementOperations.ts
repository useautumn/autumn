import type {
	AutumnBillingPlan,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import { getPreviousValues } from "@/internal/billing/v2/utils/billingPlan/getPreviousValues";

export const invertCustomerEntitlementUpdate = (
	update: UpdateCustomerEntitlement,
): UpdateCustomerEntitlement =>
	update.updates
		? {
				customerEntitlement: update.customerEntitlement,
				updates: getPreviousValues({
					before: update.customerEntitlement,
					updates: update.updates,
				}),
			}
		: {
				customerEntitlement: update.customerEntitlement,
				balanceChange: update.balanceChange ? -update.balanceChange : undefined,
				insertReplaceables: update.deletedReplaceables,
				deletedReplaceables: update.insertReplaceables?.map((replaceable) => ({
					...replaceable,
					from_entity_id: replaceable.from_entity_id ?? null,
					delete_next_cycle: replaceable.delete_next_cycle ?? false,
				})),
			};

export const getReplaceableRestorations = ({
	customerProducts,
	customerEntitlements,
}: {
	customerProducts: NonNullable<AutumnBillingPlan["deleteCustomerProducts"]>;
	customerEntitlements: NonNullable<
		AutumnBillingPlan["patchCustomerProducts"]
	>[number]["deleteCustomerEntitlements"];
}): UpdateCustomerEntitlement[] =>
	[
		...customerProducts.flatMap(
			({ customer_entitlements }) => customer_entitlements,
		),
		...customerEntitlements,
	]
		.filter(({ replaceables }) => replaceables.length > 0)
		.map((customerEntitlement) => ({
			customerEntitlement,
			insertReplaceables: customerEntitlement.replaceables,
		}));
