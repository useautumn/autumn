import {
	type EntityBalance,
	EntityNotFoundError,
	findCustomerEntitlementByFeature,
	findFeatureById,
} from "@autumn/shared";
import { adjustAllowance } from "@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { EntityService } from "../../../api/entities/EntityService.js";
import { CusService } from "../../../customers/CusService.js";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "../../../customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
	deleteEntityFromCusEnt,
	replaceEntityInCusEnt,
} from "../../../customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils.js";
import { RepService } from "../../../customers/cusProducts/cusEnts/RepService.js";
import { cancelSubsForEntity } from "./cancelSubsForEntity.js";

export const handleDeleteEntity = createRoute({
	handler: async (c) => {
		const { customer_id, entity_id } = c.req.param();
		const ctx = c.get("ctx");

		const { db, org, env, features, logger } = ctx;

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
			withEntities: true,
		});

		const existingEntities = fullCus.entities;
		const cusProducts = fullCus.customer_products;
		const entity = existingEntities.find((e) => e.id === entity_id);

		if (!entity) {
			throw new EntityNotFoundError({ entityId: entity_id });
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
				newReplaceables && newReplaceables.length > 0
					? newReplaceables[0]
					: null;

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

		logger.info(` ✅ Finished deleting entity ${entity_id}`);

		return c.json({ success: true });
	},
});
