import {
	type CustomerEntitlementFilters,
	EntInterval,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { customerEntitlementActions } from "../../customers/cusProducts/cusEnts/actions/index.js";

export const updateNextResetAt = async ({
	ctx,
	fullCustomer,
	featureId,
	nextResetAt,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureId: string | undefined;
	nextResetAt: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureIds: featureId ? [featureId] : undefined,
		entity: fullCustomer.entity,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		customerEntitlementFilters,
	});

	if (cusEnts.length === 0) {
		throw new RecaseError({
			message: `[updateNextResetAt] No balances found for feature ${featureId}, customer ${fullCustomer.id}`,
		});
	}

	const sorted = [...cusEnts].sort((a, b) => {
		const aReset = a.next_reset_at ?? Number.POSITIVE_INFINITY;
		const bReset = b.next_reset_at ?? Number.POSITIVE_INFINITY;
		return aReset - bReset;
	});

	const targetCusEnt = sorted[0];
	const targetFeatureId = featureId ?? targetCusEnt.entitlement.feature.id;

	if (targetCusEnt.entitlement.interval === EntInterval.Lifetime) {
		throw new RecaseError({
			message: `Cannot update next reset at for lifetime balance (feature ${featureId}, customer ${fullCustomer.id ?? fullCustomer.internal_id})`,
		});
	}

	await customerEntitlementActions.updateDbAndCache({
		ctx,
		customerId: fullCustomer.id ?? "",
		cusEntId: targetCusEnt.id,
		updates: { next_reset_at: nextResetAt },
		featureId: targetFeatureId,
	});
};
