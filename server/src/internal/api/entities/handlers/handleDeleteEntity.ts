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
		const { org, env, db, logtail: logger, features } = req;
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

		// const linkedCusEnts = findLinkedCusEnts({
		//   cusEnts: cusEnt.customer_product.customer_entitlements,
		//   feature: cusEnt.entitlement.feature,
		// });

		// if (!cusPriceExists || org.config.prorate_unused) {
		//   let cusEnts = cusProductsToCusEnts({ cusProducts });
		//   for (const cusEnt of cusEnts) {
		//     let relatedCusPrice = getRelatedCusPrice(
		//       cusEnt,
		//       cusProducts.flatMap((p: any) => p.customer_prices),
		//     );
		//     await removeEntityFromCusEnt({
		//       db,
		//       cusEnt,
		//       entity,
		//       logger,
		//       cusPrice: relatedCusPrice,
		//       customer,
		//       org,
		//       env,
		//     });
		//   }

		//   try {
		//     let stripeCli = createStripeCli({ org, env });
		//     let curSubs = await getStripeSubs({
		//       stripeCli,
		//       subIds: cusProducts.flatMap((p: any) => p.subscription_ids),
		//     });

		//     for (const cusProduct of cusProducts) {
		//       if (cusProduct.internal_entity_id !== entity.internal_id) {
		//         continue;
		//       }

		//       if (cusProduct.status == CusProductStatus.Scheduled) {
		//         await removeScheduledProduct({
		//           req,
		//           db,
		//           cusProduct,
		//           cusProducts,
		//           org,
		//           env,
		//           logger,
		//           renewCurProduct: false,
		//         });
		//       } else {
		//         await cancelCurSubs({
		//           curCusProduct: cusProduct,
		//           curSubs,
		//           stripeCli,
		//         });
		//       }
		//     }
		//   } catch (error) {
		//     logger.error("FAILED TO CANCEL SUBS FOR DELETED ENTITY", error);
		//   }

		//   // Perform deduction on cus ent
		//   let updateCusEnt = cusEnts.find(
		//     (e: any) => e.entitlement.feature.id === entity.feature_id,
		//   );
		//   if (updateCusEnt) {
		//     await CusEntService.increment({
		//       db,
		//       id: updateCusEnt.id,
		//       amount: 1,
		//     });
		//   }

		//   await EntityService.deleteInInternalIds({
		//     db,
		//     internalIds: [entity.internal_id],
		//     orgId: req.orgId,
		//     env: req.env,
		//   });
		// } else {
		//   await EntityService.update({
		//     db,
		//     internalId: entity.internal_id,
		//     update: {
		//       deleted: true,
		//     },
		//   });
		// }

		// logger.info(` ✅ Finished deleting entity ${entity_id}`);

		// res.status(200).json({
		//   success: true,
		// });
	} catch (error) {
		handleRequestError({ error, req, res, action: "delete entity" });
	}
};
