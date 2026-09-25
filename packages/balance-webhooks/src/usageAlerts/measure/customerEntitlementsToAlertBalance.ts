import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	type CustomerEntitlementWithPricesView,
	cusEntsHaveUnlimited,
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToCurrentBalance,
	cusEntsToPrepaidQuantity,
	cusEntsToReset,
	cusEntsToRolloverBalance,
	cusEntsToRolloverGranted,
	cusEntsToRolloverUsage,
	cusEntsToUsage,
	type Feature,
	getCusEntBalance,
	nullish,
	roundCacheBalance,
} from "@autumn/shared";

/** Draft: only the fields a usage alert reads off an API balance, with the same helpers and rounding. */
export const customerEntitlementsToAlertBalance = ({
	entityId,
	customerEntitlements,
	feature,
}: {
	entityId: string | undefined;
	customerEntitlements: CustomerEntitlementWithPricesView[];
	feature: Feature;
}): ApiBalanceV1 => {
	const unlimited =
		customerEntitlements.length > 0 &&
		cusEntsHaveUnlimited({
			cusEnts: customerEntitlements,
			internalFeatureId: feature.internal_id,
		});
	if (unlimited || customerEntitlements.length === 0)
		return {
			unlimited,
			granted: 0,
			remaining: 0,
			usage: 0,
			breakdown: [],
		} as unknown as ApiBalanceV1;

	let granted = 0;
	let remaining = 0;
	let usage = 0;
	const breakdown: Pick<
		ApiBalanceBreakdownV1,
		"included_grant" | "prepaid_grant" | "reset"
	>[] = [];
	for (const customerEntitlement of customerEntitlements) {
		const cusEnts = [customerEntitlement];
		const includedGrant =
			cusEntsToAllowance({ cusEnts, entityId }) +
			cusEntsToAdjustment({ cusEnts, entityId });
		const prepaidGrant = customerEntitlement.entitlement.expiry_duration
			? 0
			: cusEntsToPrepaidQuantity({
					cusEnts,
					sumAcrossEntities: nullish(entityId),
				});
		granted += includedGrant + prepaidGrant;
		remaining += cusEntsToCurrentBalance({ cusEnts, entityId });
		usage += cusEntsToUsage({ cusEnts, entityId });
		remaining += getCusEntBalance({ cusEnt: customerEntitlement, entityId })
			.unused;
		usage -= getCusEntBalance({ cusEnt: customerEntitlement, entityId }).unused;
		breakdown.push({
			included_grant: roundCacheBalance(includedGrant),
			prepaid_grant: roundCacheBalance(prepaidGrant),
			reset: cusEntsToReset({ cusEnts }),
		});
	}
	granted += cusEntsToRolloverGranted({
		cusEnts: customerEntitlements,
		entityId,
	});
	remaining += cusEntsToRolloverBalance({
		cusEnts: customerEntitlements,
		entityId,
	});
	usage += cusEntsToRolloverUsage({ cusEnts: customerEntitlements, entityId });
	return {
		unlimited: false,
		granted: roundCacheBalance(granted),
		remaining: roundCacheBalance(remaining),
		usage: roundCacheBalance(usage),
		breakdown,
	} as unknown as ApiBalanceV1;
};
