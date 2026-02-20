import {
	type EntityBalance,
	EntityNotFoundError,
	findCustomerEntitlementByFeature,
	findFeatureById,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";
import { adjustAllowance } from "@/internal/balances/utils/paidAllocatedFeature/adjustAllowance";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils";
import {
	deleteEntityFromCusEnt,
	replaceEntityInCusEnt,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService";
import { cancelSubsForEntity } from "../handlers/handleDeleteEntity/cancelSubsForEntity";

export const deleteEntity = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer_id: string;
		entity_id: string;
	};
}) => {
	const { customer_id: customerId, entity_id: entityId } = params;

	const { db, org, env, features, logger } = ctx;

	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withEntities: true,
	});

	const existingEntities = fullCus.entities;
	const cusProducts = fullCus.customer_products;
	const entity = existingEntities.find((e) => e.id === entityId);

	if (!entity) {
		throw new EntityNotFoundError({ entityId: entityId });
	}

	const feature = findFeatureById({
		features,
		featureId: entity.feature_id,
		errorOnNotFound: true,
	});

	for (const cusProduct of cusProducts) {
		const cusEnts = cusProduct.customer_entitlements;

		const mainCusEnt = findCustomerEntitlementByFeature({
			cusEnts,
			feature: feature!,
		});

		if (!mainCusEnt) continue;

		const { newReplaceables } = await adjustAllowance({
			db,
			env,
			org,
			cusPrices: cusProduct.customer_prices,
			customer: fullCus,
			affectedFeature: mainCusEnt.entitlement.feature,
			cusEnt: { ...mainCusEnt, customer_product: cusProduct },
			originalBalance: mainCusEnt.balance!,
			newBalance: mainCusEnt.balance! + 1,
			logger,
		});

		const linkedCusEnts = findLinkedCusEnts({
			cusEnts: cusProduct.customer_entitlements,
			feature: mainCusEnt.entitlement.feature,
		});

		const replaceable =
			newReplaceables && newReplaceables.length > 0 ? newReplaceables[0] : null;

		if (replaceable) {
			await RepService.update({
				db,
				id: replaceable.id,
				data: {
					from_entity_id: entity.id,
				},
			});
		}

		// Update linked cus ents with replaceables...
		for (const linkedCusEnt of linkedCusEnts) {
			let newEntities: {
				[key: string]: EntityBalance;
			};
			if (replaceable) {
				const { newEntities: newEntities_ } = replaceEntityInCusEnt({
					cusEnt: linkedCusEnt,
					entityId: entity.id,
					replaceable,
				});
				newEntities = newEntities_;
			} else {
				const { newEntities: newEntities_ } = deleteEntityFromCusEnt({
					cusEnt: linkedCusEnt,
					entityId: entity.id,
				});
				newEntities = newEntities_;
			}

			await CusEntService.update({
				db,
				id: linkedCusEnt.id,
				updates: {
					entities: newEntities,
				},
			});
		}

		if (!replaceable) {
			await CusEntService.increment({
				db,
				id: mainCusEnt.id,
				amount: 1,
			});
		}
	}

	// Cancel any subs
	await cancelSubsForEntity({
		ctx,
		cusProducts,
		entity,
	});

	await EntityService.deleteInInternalIds({
		db,
		internalIds: [entity.internal_id],
		orgId: org.id,
		env,
	});

	logger.info(` ✅ Finished deleting entity ${entityId}`);
};
