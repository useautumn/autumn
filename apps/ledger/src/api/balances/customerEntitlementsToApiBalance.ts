import {
	AllowanceType,
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	cusEntsToAdjustment,
	cusEntsToAllowance,
	cusEntsToCurrentBalance,
	cusEntsToMaxPurchase,
	cusEntsToNextResetAt,
	cusEntsToPlanId,
	cusEntsToPrepaidQuantity,
	cusEntsToReset,
	cusEntsToRolloverBalance,
	cusEntsToRolloverGranted,
	cusEntsToRollovers,
	cusEntsToRolloverUsage,
	cusEntsToUsage,
	cusEntToInvoiceOverage,
	customerEntitlementToBalancePrice,
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	getBooleanApiBalance,
	getCusEntBalance,
	getUnlimitedApiBalance,
	isUnlimitedCusEnt,
	sumValues,
} from "@autumn/shared";

// Local port of shared getApiBalance: that helper needs a SharedContext (the
// full organization row) and a FullCustomer, neither of which the ledger
// mirrors. Every field is still computed by the shared cusEnt helpers.
const customerEntitlementToBreakdownItem = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): ApiBalanceBreakdownV1 => {
	const cusEnts = [customerEntitlement];
	const includedGrant = sumValues([
		cusEntsToAllowance({ cusEnts }),
		cusEntsToAdjustment({ cusEnts }),
	]);

	return {
		object: "balance_breakdown",
		id: customerEntitlement.external_id ?? customerEntitlement.id,
		plan_id: cusEntsToPlanId({ cusEnts }),
		included_grant: includedGrant,
		prepaid_grant: cusEntsToPrepaidQuantity({
			cusEnts,
			sumAcrossEntities: true,
		}),
		remaining: cusEntsToCurrentBalance({ cusEnts }),
		usage: cusEntsToUsage({ cusEnts }),
		unlimited: isUnlimitedCusEnt(customerEntitlement),
		reset: cusEntsToReset({ cusEnts }),
		price: customerEntitlementToBalancePrice({ customerEntitlement }),
		expires_at: customerEntitlement.expires_at,
		overage: cusEntToInvoiceOverage({ cusEnt: customerEntitlement }),
	};
};

const hasUnlimited = (cusEnts: FullCusEntWithFullCusProduct[]): boolean =>
	cusEnts.some(
		(cusEnt) =>
			cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
			Boolean(cusEnt.unlimited),
	);

const allowsOverage = (cusEnts: FullCusEntWithFullCusProduct[]): boolean =>
	cusEnts.some((cusEnt) => Boolean(cusEnt.usage_allowed));

export const customerEntitlementsToApiBalance = ({
	customerEntitlements,
	feature,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	feature: Feature;
}): ApiBalanceV1 | null => {
	if (customerEntitlements.length === 0) return null;

	if (feature.type === FeatureType.Boolean) {
		return getBooleanApiBalance({ cusEnts: customerEntitlements });
	}

	if (hasUnlimited(customerEntitlements)) {
		return getUnlimitedApiBalance({ cusEnts: customerEntitlements });
	}

	const breakdown = customerEntitlements.map(
		customerEntitlementToBreakdownItem,
	);
	const unused = sumValues(
		customerEntitlements.map((cusEnt) => getCusEntBalance({ cusEnt }).unused),
	);
	const granted = sumValues(
		breakdown.flatMap((item) => [item.included_grant, item.prepaid_grant]),
	);

	return {
		object: "balance",
		feature_id: feature.id,
		granted: sumValues([
			granted,
			cusEntsToRolloverGranted({ cusEnts: customerEntitlements }),
		]),
		remaining: sumValues([
			...breakdown.map((item) => item.remaining),
			cusEntsToRolloverBalance({ cusEnts: customerEntitlements }),
			unused,
		]),
		usage: sumValues([
			...breakdown.map((item) => item.usage),
			cusEntsToRolloverUsage({ cusEnts: customerEntitlements }),
			-unused,
		]),
		unlimited: false,
		overage_allowed: allowsOverage(customerEntitlements),
		max_purchase: cusEntsToMaxPurchase({ cusEnts: customerEntitlements }),
		next_reset_at: cusEntsToNextResetAt({ cusEnts: customerEntitlements }),
		breakdown,
		rollovers: cusEntsToRollovers({ cusEnts: customerEntitlements }),
	};
};
