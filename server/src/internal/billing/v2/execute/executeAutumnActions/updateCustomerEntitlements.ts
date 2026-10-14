import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";

export const updateCustomerEntitlements = async ({
	ctx,
	customerId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	updates: AutumnBillingPlan["updateCustomerEntitlements"];
}) => {
	const { logger } = ctx;

	for (const updateDetail of updates ?? []) {
		const {
			balanceChange = 0,
			entityBalanceChanges,
			moveEntityBalances,
			customerEntitlement,
			updates,
			insertRollovers = [],
		} = updateDetail;

		logger.debug(
			`updating customer entitlement ${customerEntitlement.id} ${balanceChange ? `+${balanceChange}` : updates ? JSON.stringify(updates) : "none"}`,
		);

		const featureId = customerEntitlement.entitlement.feature.id;
		if (updates) {
			await customerEntitlementActions.updateDbAndCache({
				ctx,
				customerId,
				cusEntId: customerEntitlement.id,
				updates,
				incrementCacheVersion: true,
				featureId,
			});
		} else {
			if (balanceChange !== 0) {
				await customerEntitlementActions.adjustBalanceDbAndCache({
					ctx,
					customerId,
					cusEntId: customerEntitlement.id,
					delta: balanceChange,
					featureId,
				});
			}

			if (moveEntityBalances && Object.keys(moveEntityBalances).length > 0) {
				await CusEntService.moveEntityBalances({
					ctx,
					id: customerEntitlement.id,
					moves: moveEntityBalances,
				});
			}
			if (
				entityBalanceChanges &&
				Object.keys(entityBalanceChanges).length > 0
			) {
				await CusEntService.incrementEntityBalances({
					ctx,
					id: customerEntitlement.id,
					changes: entityBalanceChanges,
				});
			}
		}

		if (insertRollovers.length > 0) {
			await RolloverService.insert({
				ctx,
				rows: insertRollovers,
				fullCusEnt: { customer_product: null, ...customerEntitlement },
			});
		}
	}
};
