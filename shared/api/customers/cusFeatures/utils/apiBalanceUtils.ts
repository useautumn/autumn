import type { ApiFeatureV1 } from "@api/features/apiFeatureV1";
import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { AllowanceType } from "@models/productModels/entModels/entModels.js";
import { cusEntsToPlanId, cusEntsToRollovers } from "@utils/index.js";
import { Decimal } from "decimal.js";
import type { ApiBalanceBreakdownV1, ApiBalanceV1 } from "../apiBalanceV1";

const isUnlimitedUsageCusEnt = (cusEnt: FullCusEntWithFullCusProduct) =>
	cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
	Boolean(cusEnt.unlimited);

const getUnlimitedUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): number => {
	let totalBalance = new Decimal(0);

	for (const cusEnt of cusEnts.filter(isUnlimitedUsageCusEnt)) {
		const isEntityScoped = Boolean(cusEnt.entitlement.entity_feature_id);

		if (entityId && isEntityScoped) {
			// Entity view: only this entity's slice of an entity-scoped cusEnt
			totalBalance = totalBalance.add(
				cusEnt.entities?.[entityId]?.balance ?? 0,
			);
			continue;
		}

		// Customer view (or a customer-level pool seen from an entity view):
		// top-level balance plus every per-entity balance
		totalBalance = totalBalance.add(cusEnt.balance ?? 0);
		if (!entityId) {
			for (const entityBalance of Object.values(cusEnt.entities ?? {})) {
				totalBalance = totalBalance.add(entityBalance.balance ?? 0);
			}
		}
	}

	// Usage is the negated balance; no clamping so refund overshoot
	// (positive balance) reports negative usage faithfully
	return totalBalance.neg().toNumber();
};

export const getBooleanApiBalance = ({
	cusEnts,
	apiFeature,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	apiFeature?: ApiFeatureV1;
}): ApiBalanceV1 => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;

	return {
		object: "balance",

		feature: apiFeature,
		feature_id: feature.id,

		unlimited: false,

		granted: 0,
		remaining: 0,
		usage: 0,

		overage_allowed: false,
		max_purchase: null,
		next_reset_at: null,

		breakdown: [
			{
				object: "balance_breakdown",
				id,
				plan_id: planId,
				included_grant: 0,
				prepaid_grant: 0,
				remaining: 0,
				usage: 0,
				unlimited: false,
				reset: null,
				expires_at: null,
				price: null,
				overage: 0,
			} satisfies ApiBalanceBreakdownV1,
		],
		rollovers: undefined,
	};
};

export const getUnlimitedApiBalance = ({
	apiFeature,
	cusEnts,
	entityId,
}: {
	apiFeature?: ApiFeatureV1;
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): ApiBalanceV1 => {
	const feature = cusEnts[0].entitlement.feature;
	const planId = cusEntsToPlanId({ cusEnts });
	const id = cusEnts[0].id;
	const usage = getUnlimitedUsage({ cusEnts, entityId });

	return {
		object: "balance",
		feature: apiFeature,
		feature_id: feature.id,

		unlimited: true,

		granted: 0,
		remaining: 0,
		usage,

		next_reset_at: null,
		max_purchase: null,
		overage_allowed: false,

		breakdown: [
			{
				object: "balance_breakdown",
				id,
				plan_id: planId,
				included_grant: 0,
				prepaid_grant: 0,
				remaining: 0,
				usage,
				unlimited: true,
				reset: null,
				expires_at: null,
				price: null,
				overage: 0,
			} satisfies ApiBalanceBreakdownV1,
		],
		rollovers: cusEntsToRollovers({ cusEnts, entityId }),
	};
};
