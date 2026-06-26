import {
	cusEntsToUsage,
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	isEntityScopedCusEnt,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

export const findOverageCusEnt = ({
	recalculateBalances,
	usageToRecalculate,
	customerEntitlements,
	sameFeatureCusEnts,
}: {
	recalculateBalances?: boolean;
	usageToRecalculate: number;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	sameFeatureCusEnts: FullCusEntWithFullCusProduct[];
}) => {
	if (!recalculateBalances || usageToRecalculate <= 0) return undefined;

	const deletingIds = new Set(customerEntitlements.map((cusEnt) => cusEnt.id));
	const hasSurvivingBalance = sameFeatureCusEnts.some(
		(cusEnt) => !deletingIds.has(cusEnt.id),
	);

	return hasSurvivingBalance ? undefined : customerEntitlements[0];
};

const getOverageCusEntUpdates = ({
	cusEnt,
	fullCustomer,
	usageToRecalculate,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer;
	usageToRecalculate: number;
}) => {
	const resetlessUpdates = {
		next_reset_at: null,
		reset_cycle_anchor: null,
	};
	const grantAdjustment = -cusEntToStartingBalance({ cusEnt });

	if (!isEntityScopedCusEnt(cusEnt) || cusEnt.internal_entity_id) {
		return {
			...resetlessUpdates,
			balance: -usageToRecalculate,
			additional_balance: 0,
			adjustment: grantAdjustment,
		};
	}

	const entityIds = fullCustomer.entity?.id
		? [fullCustomer.entity.id]
		: Object.keys(cusEnt.entities);
	const entities = { ...cusEnt.entities };
	for (const entityId of entityIds) {
		const entity = entities[entityId];
		if (!entity) continue;

		entities[entityId] = {
			...entity,
			balance: -cusEntsToUsage({ cusEnts: [cusEnt], entityId }),
			additional_balance: 0,
			adjustment: grantAdjustment,
		};
	}

	return {
		...resetlessUpdates,
		entities,
	};
};

export const markCusProductCustom = async ({
	ctx,
	cusEnt,
}: {
	ctx: AutumnContext;
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	if (!cusEnt.customer_product_id) return;

	await CusProductService.update({
		ctx,
		cusProductId: cusEnt.customer_product_id,
		updates: {
			is_custom: true,
		},
	});
};

export const preserveBalanceAsOverage = async ({
	ctx,
	cusEnt,
	fullCustomer,
	usageToRecalculate,
}: {
	ctx: AutumnContext;
	cusEnt: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer;
	usageToRecalculate: number;
}) => {
	await CusEntService.update({
		ctx,
		id: cusEnt.id,
		updates: getOverageCusEntUpdates({
			cusEnt,
			fullCustomer,
			usageToRecalculate,
		}),
	});

	await markCusProductCustom({ ctx, cusEnt });
};
