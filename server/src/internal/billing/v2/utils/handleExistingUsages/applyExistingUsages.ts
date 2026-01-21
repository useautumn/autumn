import {
	cusProductsToCusEnts,
	type Entity,
	type ExistingUsages,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { mergeEntitiesWithExistingUsages } from "./mergeEntitiesWithExistingUsages";

const logExistingUsages = ({
	ctx,
	existingUsages,
}: {
	ctx: AutumnContext;
	existingUsages: ExistingUsages;
}) => {
	const existinUsagesLogs = Object.entries(existingUsages).map(
		([internalFeatureId, existingUsage]) => {
			const entityUsages = Object.entries(existingUsage.entityUsages).map(
				([entityId, entityUsage]) => ({
					entityId,
					entityUsage,
				}),
			);
			return {
				featureId: ctx.features.find((f) => f.internal_id === internalFeatureId)
					?.id,
				usage: existingUsage.usage,
				entityUsages: entityUsages.length > 0 ? entityUsages : undefined,
			};
		},
	);

	addToExtraLogs({
		ctx,
		extras: {
			existingUsages: existinUsagesLogs,
		},
	});
};

export const applyExistingUsages = ({
	ctx,
	customerProduct,
	existingUsages = {},
	entities,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	existingUsages?: ExistingUsages;
	entities: Entity[];
}) => {
	// 1. Merge entities with existing usages
	const mergedExistingUsages = mergeEntitiesWithExistingUsages({
		entities,
		existingUsages,
	});

	logExistingUsages({
		ctx,
		existingUsages: mergedExistingUsages,
	});

	for (const [internalFeatureId, existingUsage] of Object.entries<
		ExistingUsages[string]
	>(mergedExistingUsages)) {
		const cusEnts = cusProductsToCusEnts({
			cusProducts: [customerProduct],
			internalFeatureIds: [internalFeatureId],
		});

		// 1. Deduct entity usages
		for (const [entityId, entityUsage] of Object.entries(
			existingUsage.entityUsages,
		)) {
			deductFromCusEntsTypescript({
				cusEnts,
				amountToDeduct: entityUsage,
				targetEntityId: entityId,
			});
		}

		// 2. Deduct top level usages
		deductFromCusEntsTypescript({
			cusEnts,
			amountToDeduct: existingUsage.usage,
		});

		for (const newCusEnt of cusEnts) {
			const original = customerProduct.customer_entitlements.find(
				(ce) => ce.id === newCusEnt.id,
			);
			if (original) {
				original.balance = newCusEnt.balance;
				original.entities = newCusEnt.entities;
				original.adjustment = newCusEnt.adjustment;

				ctx.logger.debug(`Deduction for feature ${newCusEnt.feature_id}:`, {
					balance: newCusEnt.balance,
					entities: newCusEnt.entities,
					adjustment: newCusEnt.adjustment,
				});
			}
		}
	}
};
