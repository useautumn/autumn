import {
	type CustomerEntitlementFilters,
	EntInterval,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	isPaidCustomerEntitlement,
	notNullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

export const updateExpiresAtV2 = async ({
	ctx,
	fullSubject,
	featureId,
	expiresAt,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string | undefined;
	expiresAt: number;
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
			message: `No balances found for feature ${featureId}, customer ${fullSubject.customerId}`,
			statusCode: 404,
		});
	}

	const sorted = [...cusEnts].sort((a, b) => {
		const aExpires = a.expires_at ?? Number.POSITIVE_INFINITY;
		const bExpires = b.expires_at ?? Number.POSITIVE_INFINITY;
		return aExpires - bExpires;
	});

	const targetCusEnt = sorted[0];

	const interval = targetCusEnt.entitlement.interval;
	const isRecurring = notNullish(interval) && interval !== EntInterval.Lifetime;
	if (isRecurring && isPaidCustomerEntitlement(targetCusEnt)) {
		throw new RecaseError({
			message: `expires_at cannot be set on a paid recurring balance (feature ${targetCusEnt.entitlement.feature.id}); its lifetime follows the billing cycle`,
			statusCode: 400,
		});
	}

	await CusEntService.update({
		ctx,
		id: targetCusEnt.id,
		updates: { expires_at: expiresAt },
		incrementCacheVersion: false,
	});
};
