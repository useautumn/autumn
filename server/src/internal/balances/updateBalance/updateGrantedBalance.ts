import type { CustomerEntitlementFilters, FullCustomer } from "@autumn/shared";
import {
	cusEntsToAllowance,
	fullCustomerToCustomerEntitlements,
	InternalError,
	isEntityScopedCusEnt,
	notNullish,
	nullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { customerEntitlementActions } from "../../customers/cusProducts/cusEnts/actions/index.js";

export const updateGrantedBalance = async ({
	ctx,
	fullCustomer,
	featureId,
	targetGrantedBalance,
	customerEntitlementFilters = {},
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureId: string | undefined;
	targetGrantedBalance: number;
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
			message: `[updateGrantedBalance] No balances to update for feature ${featureId}, customer ${fullCustomer.id}`,
		});
	}

	const currentAllowance = cusEntsToAllowance({
		cusEnts,
		entityId: fullCustomer.entity?.id ?? undefined,
		withRollovers: false,
	});

	const requiredAdjustment = new Decimal(targetGrantedBalance)
		.sub(currentAllowance)
		.toNumber();

	const targetCusEnt = cusEnts[0];
	const isEntityScoped = isEntityScopedCusEnt(targetCusEnt);
	const entityId = fullCustomer.entity?.id;

	if (isEntityScoped) {
		const entityKeys = Object.keys(targetCusEnt.entities ?? {});
		const targetEntityId = notNullish(entityId) ? entityId : entityKeys[0];

		if (
			nullish(targetEntityId) ||
			nullish(targetCusEnt.entities?.[targetEntityId])
		) {
			throw new InternalError({
				message: `[updateGrantedBalance] No entity balance found for feature ${featureId}, customer ${fullCustomer.id}`,
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

		await customerEntitlementActions.updateDbAndCache({
			ctx,
			customerId: fullCustomer.id ?? "",
			cusEntId: targetCusEnt.id,
			updates: { entities: newEntities },
		});

		targetCusEnt.entities = newEntities;
	} else {
		await customerEntitlementActions.updateDbAndCache({
			ctx,
			customerId: fullCustomer.id ?? "",
			cusEntId: targetCusEnt.id,
			updates: { adjustment: requiredAdjustment },
		});

		targetCusEnt.adjustment = requiredAdjustment;
	}
};
