import {
	addCusProductToCusEnt,
	type CreateEntityParams,
	cusEntToCusPrice,
	ErrCode,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	findCustomerEntitlementByFeature,
	findFeatureById,
	type Replaceable,
} from "@autumn/shared";
import { acquireLock, clearLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { adjustAllowance } from "@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js";
import { getReps } from "@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedUpgrade.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";

const updateLinkedCusEnt = async ({
	ctx,
	linkedCusEnt,
	inputEntities,
	entityToReplacement,
}: {
	ctx: AutumnContext;
	linkedCusEnt: FullCustomerEntitlement;
	inputEntities: CreateEntityParams[];
	entityToReplacement: Record<string, string>;
}) => {
	const newEntities = structuredClone(linkedCusEnt.entities) || {};
	for (const entity of inputEntities) {
		if (!entity.id) continue;

		const replaceableId = entityToReplacement[entity.id];
		const replaceableInEntities = replaceableId
			? newEntities[replaceableId]
			: null;

		if (replaceableInEntities) {
			newEntities[entity.id] = {
				...replaceableInEntities,
				id: entity.id,
			};
			delete newEntities[replaceableId];
		} else {
			const balance = linkedCusEnt.entitlement.allowance!;
			newEntities[entity.id] = {
				id: entity.id,
				balance,
				adjustment: 0,
			};
		}

		await CusEntService.update({
			ctx,
			id: linkedCusEnt.id,
			updates: {
				entities: newEntities,
			},
		});
	}
};

export const createEntityForCusProduct = async ({
	ctx,
	customer,
	cusProduct,
	inputEntities,
	fromAutoCreate = false,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	cusProduct: FullCusProduct;
	inputEntities: CreateEntityParams[];
	fromAutoCreate?: boolean;
}) => {
	const featureToEntities = inputEntities.reduce(
		(acc, entity) => {
			acc[entity.feature_id!] = [...(acc[entity.feature_id!] || []), entity];
			return acc;
		},
		{} as Record<string, CreateEntityParams[]>,
	);

	const { db, env, org, features, logger } = ctx;

	const cusEnts = cusProduct.customer_entitlements;
	const cusPrices = cusProduct.customer_prices;

	for (const featureId in featureToEntities) {
		const inputEntities = featureToEntities[featureId]!;
		const feature = findFeatureById({
			features,
			featureId,
			errorOnNotFound: true,
		});

		const mainCusEnt = findCustomerEntitlementByFeature({
			cusEnts,
			feature,
		});

		let mainCusEntWithCusProduct: FullCusEntWithFullCusProduct | undefined;

		if (mainCusEnt) {
			mainCusEntWithCusProduct = addCusProductToCusEnt({
				cusEnt: mainCusEnt,
				cusProduct,
			});

			const cusPrice = cusEntToCusPrice({
				cusEnt: mainCusEntWithCusProduct,
			});

			if (fromAutoCreate && cusPrice) {
				throw new RecaseError({
					message: `Failed to auto create entity for feature ${feature.name} because it is a paid feature.`,
					code: ErrCode.InvalidInputs,
				});
			}
		}

		// 1. If main cus ent:
		let deletedReplaceables: Replaceable[] = [];
		if (mainCusEntWithCusProduct) {
			// Acquire lock to prevent race conditions on seat charging
			const lockKey = `lock:create-entity:${org.id}:${env}:${customer.id}`;
			await acquireLock({
				lockKey,
				ttlMs: 10000,
				errorMessage:
					"Entity creation already in progress for this customer, try again in a few seconds",
			});

			try {
				const originalBalance = mainCusEntWithCusProduct.balance || 0;
				const newBalance = originalBalance - inputEntities.length;

				const repsLength = getReps({
					cusEnt: mainCusEntWithCusProduct,
					prevBalance: originalBalance,
					newBalance,
				}).length;
				const innerNewBalance = newBalance + repsLength;

				// Check if new balance would exceed usage limit
				if (
					notNullish(mainCusEntWithCusProduct.entitlement.usage_limit) &&
					innerNewBalance < -mainCusEntWithCusProduct.entitlement.usage_limit!
				) {
					throw new RecaseError({
						message: `Cannot create ${inputEntities.length} entities for feature ${feature.name} as it would exceed the usage limit.`,
						code: ErrCode.FeatureLimitReached,
					});
				}

				const { deletedReplaceables: deletedReplaceables_ } =
					await adjustAllowance({
						ctx,
						cusPrices,
						customer,
						affectedFeature: feature!,
						cusEnt: mainCusEntWithCusProduct,
						originalBalance,
						newBalance: innerNewBalance,
						errorIfIncomplete: true,
					});

				deletedReplaceables = deletedReplaceables_ || [];

				await CusEntService.decrement({
					ctx,
					id: mainCusEntWithCusProduct.id,
					amount: inputEntities.length - deletedReplaceables.length,
				});
			} finally {
				await clearLock({ lockKey });
			}
		}

		const entityToReplacement: Record<string, string> = {};
		for (let i = 0; i < deletedReplaceables.length; i++) {
			const replaceable = deletedReplaceables[i];
			entityToReplacement[inputEntities[i].id!] = replaceable.id;

			if (i >= inputEntities.length) {
				break;
			}
		}

		const linkedCusEnts = findLinkedCusEnts({
			cusEnts,
			feature,
		});

		for (const linkedCusEnt of linkedCusEnts) {
			await updateLinkedCusEnt({
				ctx,
				linkedCusEnt,
				inputEntities,
				entityToReplacement,
			});
		}
	}
};
