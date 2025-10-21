import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { handleCustomerRaceCondition } from "@/external/redis/redisUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
	findLinkedCusEnts,
	findMainCusEntForFeature,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
	deleteEntityFromCusEnt,
	replaceEntityInCusEnt,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/linkedCusEntUtils.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { cancelSubsForEntity } from "@/internal/entities/handlers/handleDeleteEntity/cancelSubsForEntity.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { EntityService } from "../EntityService.js";

export const handleDeleteEntity = async (req: any, res: any) => {
	try {
		const { org, env, db, logger, features } = req;
		const { customer_id, entity_id } = req.params;

		await handleCustomerRaceCondition({
			action: "entity",
			customerId: customer_id,
			orgId: org.id,
			env,
			res,
			logger,
		});

		const customer = await CusService.getFull({
			db,
			idOrInternalId: customer_id,
			orgId: req.orgId,
			env: req.env,
			withEntities: true,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
			],
		});

		if (!customer) {
			throw new RecaseError({
				message: `Customer ${customer_id} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const existingEntities = customer.entities;
		const cusProducts = customer.customer_products;
		const entity = existingEntities.find((e: any) => e.id === entity_id);

		if (!entity) {
			throw new RecaseError({
				message: `Entity ${entity_id} not found`,
				code: ErrCode.EntityNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		} else if (entity.deleted) {
			throw new RecaseError({
				message: `Entity ${entity_id} already deleted`,
				code: ErrCode.EntityAlreadyDeleted,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const feature = features.find((f: any) => f.id === entity?.feature_id);

		for (const cusProduct of cusProducts) {
			const cusEnts = cusProduct.customer_entitlements;

			const mainCusEnt = findMainCusEntForFeature({
				cusEnts,
				feature,
			});

			if (!mainCusEnt) {
				continue;
			}

			const { newReplaceables } = await adjustAllowance({
				db,
				env,
				org,
				cusPrices: cusProducts.flatMap((p: any) => p.customer_prices),
				customer,
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
				let newEntities;
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
			req,
			cusProducts,
			entity,
		});

		await EntityService.deleteInInternalIds({
			db,
			internalIds: [entity.internal_id],
			orgId: req.orgId,
			env: req.env,
		});

		logger.info(` ✅ Finished deleting entity ${entity_id}`);

		return res.status(200).json({
			success: true,
		});
	} catch (error) {
		handleRequestError({ error, req, res, action: "delete entity" });
	}
};
