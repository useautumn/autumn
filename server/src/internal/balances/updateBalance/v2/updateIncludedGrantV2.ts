import {
	type CustomerEntitlementFilters,
	cusEntsToAllowance,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	InternalError,
	isEntityScopedCusEnt,
	notNullish,
	nullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { updateSubjectBalanceCache } from "@/internal/customers/cusProducts/cusEnts/actions/cache/updateSubjectBalanceCache.js";

export const updateIncludedGrantV2 = async ({
	ctx,
	fullSubject,
	featureId,
	targetGrantedBalance,
	customerEntitlementFilters = {},
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string | undefined;
	targetGrantedBalance: number;
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
			message: `[updateIncludedGrantV2] No balances to update for feature ${featureId}, customer ${fullSubject.customerId}`,
		});
	}

	const currentAllowance = cusEntsToAllowance({
		cusEnts,
		entityId: fullSubject.entityId,
		withRollovers: false,
	});

	const requiredAdjustment = new Decimal(targetGrantedBalance)
		.sub(currentAllowance)
		.toNumber();

	const targetCusEnt = cusEnts[0];
	const targetFeatureId = featureId ?? targetCusEnt.entitlement.feature.id;
	const isEntityScoped = isEntityScopedCusEnt(targetCusEnt);
	const entityId = fullSubject.entityId;

	if (isEntityScoped) {
		const entityKeys = Object.keys(targetCusEnt.entities ?? {});
		const targetEntityId = notNullish(entityId) ? entityId : entityKeys[0];

		if (
			nullish(targetEntityId) ||
			nullish(targetCusEnt.entities?.[targetEntityId])
		) {
			throw new InternalError({
				message: `[updateIncludedGrantV2] No entity balance found for feature ${featureId}, customer ${fullSubject.customerId}`,
			});
		}

		const currentEntity = targetCusEnt.entities[targetEntityId];
		const newEntities = {
			...targetCusEnt.entities,
			[targetEntityId]: {
				id: targetEntityId,
				balance: currentEntity.balance,
				adjustment: requiredAdjustment,
				additional_balance: currentEntity.additional_balance,
			},
		};

		await CusEntService.update({
			ctx,
			id: targetCusEnt.id,
			updates: { entities: newEntities },
			incrementCacheVersion: false,
		});

		await updateSubjectBalanceCache({
			ctx,
			customerId: fullSubject.customerId,
			featureId: targetFeatureId,
			customerEntitlementId: targetCusEnt.id,
			updates: { entities: newEntities },
		});
	} else {
		await CusEntService.update({
			ctx,
			id: targetCusEnt.id,
			updates: { adjustment: requiredAdjustment },
			incrementCacheVersion: false,
		});

		await updateSubjectBalanceCache({
			ctx,
			customerId: fullSubject.customerId,
			featureId: targetFeatureId,
			customerEntitlementId: targetCusEnt.id,
			updates: { adjustment: requiredAdjustment },
		});
	}
};
