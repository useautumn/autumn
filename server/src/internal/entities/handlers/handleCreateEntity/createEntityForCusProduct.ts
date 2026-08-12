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
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { adjustAllowance } from "@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js";
import { getReps } from "@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedUpgrade.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { findLinkedCusEnts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
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
			const balance = linkedCusEnt.is_pooled_balance
				? (linkedCusEnt.pooled_balance?.granted ?? 0)
				: (linkedCusEnt.entitlement.allowance ?? 0);
			newEntities[entity.id] = {
				id: entity.id,
				balance,
				adjustment: 0,
			};
		}
	}

	await CusEntService.update({
		ctx,
		id: linkedCusEnt.id,
		updates: { entities: newEntities },
	});

	linkedCusEnt.entities = newEntities;
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
					statusCode: 400,
				});
			}
		}

		const isPooled = mainCusEntWithCusProduct?.entitlement.pooled === true;
		const targetCusEnt = isPooled
			? (customer.pooled_customer_entitlements?.find(
					(p) => p.entitlement.feature.id === feature.id,
				) as FullCusEntWithFullCusProduct | undefined) || mainCusEntWithCusProduct
			: mainCusEntWithCusProduct;

		let newEntitiesToCreate = inputEntities;
		if (isPooled && targetCusEnt) {
			const existingEntities = targetCusEnt.entities || {};
			newEntitiesToCreate = inputEntities.filter(
				(e) => !e.id || !existingEntities[e.id],
			);
			if (newEntitiesToCreate.length === 0) {
				continue;
			}
		}

		// 1. If target cus ent:
		let deletedReplaceables: Replaceable[] = [];
		if (targetCusEnt) {
			// Acquire lock to prevent race conditions on seat charging
			const lockKey = `lock:create-entity:${org.id}:${env}:${customer.id}`;
			await acquireLock({
				lockKey,
				ttlMs: 10000,
				errorMessage:
					"Entity creation already in progress for this customer, try again in a few seconds",
			});

			try {
				const originalBalance = targetCusEnt.balance || 0;
				const newBalance = originalBalance - newEntitiesToCreate.length;

				// Pre-compute reps only for the usage limit check —
				// handleProratedUpgrade applies reps itself, so we must NOT
				// pass an already-adjusted balance to adjustAllowance.
				const repsLength = getReps({
					cusEnt: targetCusEnt,
					prevBalance: originalBalance,
					newBalance,
				}).length;
				const balanceAfterReps = newBalance + repsLength;

				if (
					notNullish(targetCusEnt.entitlement.usage_limit) &&
					balanceAfterReps < -targetCusEnt.entitlement.usage_limit!
				) {
					throw new RecaseError({
						message: `Cannot create ${newEntitiesToCreate.length} entities for feature ${feature.name} as it would exceed the usage limit.`,
						code: ErrCode.FeatureLimitReached,
						statusCode: 400,
					});
				}

				const { deletedReplaceables: deletedReplaceables_ } =
					await adjustAllowance({
						ctx,
						cusPrices,
						customer,
						affectedFeature: feature!,
						cusEnt: targetCusEnt,
						originalBalance,
						newBalance,
						errorIfIncomplete: true,
					});

				deletedReplaceables = deletedReplaceables_ || [];

				await CusEntService.decrement({
					ctx,
					id: targetCusEnt.id,
					amount: newEntitiesToCreate.length - deletedReplaceables.length,
				});

				// Update in-memory balance
				targetCusEnt.balance = (targetCusEnt.balance || 0) - (newEntitiesToCreate.length - deletedReplaceables.length);
			} finally {
				await clearLock({ lockKey });
			}
		}

		const entityToReplacement: Record<string, string> = {};
		for (let i = 0; i < deletedReplaceables.length; i++) {
			const replaceable = deletedReplaceables[i];
			entityToReplacement[newEntitiesToCreate[i].id!] = replaceable.id;

			if (i >= newEntitiesToCreate.length) {
				break;
			}
		}

		const linkedCusEnts = isPooled && targetCusEnt
			? [targetCusEnt]
			: findLinkedCusEnts({
					cusEnts,
					feature,
				});

		for (const linkedCusEnt of linkedCusEnts) {
			await updateLinkedCusEnt({
				ctx,
				linkedCusEnt,
				inputEntities: newEntitiesToCreate,
				entityToReplacement,
			});
		}

		if (linkedCusEnts.length > 0) {
			await deleteCachedFullCustomer({
				ctx,
				customerId: customer.id ?? "",
			});
		}
	}
};
