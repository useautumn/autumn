import {
	type CustomerEntitlementFilters,
	EntInterval,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { updateSubjectBalanceCache } from "@/internal/customers/cusProducts/cusEnts/actions/cache/updateSubjectBalanceCache.js";

export const updateNextResetAtV2 = async ({
	ctx,
	fullSubject,
	featureId,
	nextResetAt,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string | undefined;
	nextResetAt: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: featureId ? [featureId] : undefined,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		customerEntitlementFilters,
	});

	if (cusEnts.length === 0) {
		throw new RecaseError({
			message: `[updateNextResetAtV2] No balances found for feature ${featureId}, customer ${fullSubject.customerId}`,
		});
	}

	const sorted = [...cusEnts].sort((a, b) => {
		const aReset = a.next_reset_at ?? Number.POSITIVE_INFINITY;
		const bReset = b.next_reset_at ?? Number.POSITIVE_INFINITY;
		return aReset - bReset;
	});

	const targetCusEnt = sorted[0];

	if (targetCusEnt.entitlement.interval === EntInterval.Lifetime) {
		throw new RecaseError({
			message: `Cannot update next reset at for lifetime balance (feature ${featureId}, customer ${fullSubject.customerId})`,
		});
	}

	const targetFeatureId = featureId ?? targetCusEnt.entitlement.feature.id;

	await CusEntService.update({
		ctx,
		id: targetCusEnt.id,
		updates: { next_reset_at: nextResetAt },
		incrementCacheVersion: false,
	});

	await updateSubjectBalanceCache({
		ctx,
		customerId: fullSubject.customerId,
		featureId: targetFeatureId,
		customerEntitlementId: targetCusEnt.id,
		updates: { next_reset_at: nextResetAt },
	});
};
