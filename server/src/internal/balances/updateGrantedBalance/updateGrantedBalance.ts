import type { CustomerEntitlementFilters, FullCustomer } from "@autumn/shared";
import {
	cusEntsToAllowance,
	cusProductsToCusEnts,
	FeatureNotFoundError,
	InternalError,
	isEntityScopedCusEnt,
	notNullish,
	nullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusEntService } from "../../customers/cusProducts/cusEnts/CusEntitlementService.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const updateGrantedBalance = async ({
	ctx,
	fullCus,
	featureId,
	targetGrantedBalance,
	customerEntitlementFilters = {},
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	featureId: string;
	targetGrantedBalance: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const feature = ctx.features.find((f) => f.id === featureId);

	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		featureIds: [featureId],
		entity: fullCus.entity,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		customerEntitlementFilters,
	});

	if (cusEnts.length === 0) {
		throw new RecaseError({
			message: `[updateGrantedBalance] No balances to update for feature ${featureId}, customer ${fullCus.id}`,
		});
	}

	const currentAllowance = cusEntsToAllowance({
		cusEnts,
		entityId: fullCus.entity?.id,
		withRollovers: false,
	});

	const requiredAdjustment = new Decimal(targetGrantedBalance)
		.sub(currentAllowance)
		.toNumber();

	const targetCusEnt = cusEnts[0];
	const isEntityScoped = isEntityScopedCusEnt(targetCusEnt);
	const entityId = fullCus.entity?.id;

	if (isEntityScoped) {
		const entityKeys = Object.keys(targetCusEnt.entities ?? {});
		const targetEntityId = notNullish(entityId) ? entityId : entityKeys[0];

		// Throw error if no entity balance exists
		if (
			nullish(targetEntityId) ||
			nullish(targetCusEnt.entities?.[targetEntityId])
		) {
			throw new InternalError({
				message: `[updateGrantedBalance] No entity balance found for feature ${featureId}, customer ${fullCus.id}`,
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
			db: ctx.db,
			id: targetCusEnt.id,
			updates: { entities: newEntities },
		});

		// Update the cusEnt in place
		targetCusEnt.entities = newEntities;
	} else {
		await CusEntService.update({
			db: ctx.db,
			id: targetCusEnt.id,
			updates: { adjustment: requiredAdjustment },
		});

		// Update the cusEnt in place
		targetCusEnt.adjustment = requiredAdjustment;
	}

	await deleteCachedApiCustomer({
		ctx,
		customerId: fullCus.id ?? "",
		source: "updateGrantedBalance",
	});

	// // Update Redis cache directly (avoids clearing cache which causes race conditions)
	// await setCachedGrantedBalance({
	// 	ctx,
	// 	fullCus,
	// });
};
