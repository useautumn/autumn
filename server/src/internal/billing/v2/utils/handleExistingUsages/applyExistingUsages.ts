import {
	cusProductsToCusEnts,
	type Entity,
	type ExistingUsages,
	type FullCusProduct,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
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
				accruedOverage: existingUsage.accruedOverage,
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
		const attributionOwnerId = existingUsage.usageAttribution
			? (cusEnts.find(
					(customerEntitlement) =>
						customerEntitlement.entitlement.feature.config?.invoice_credit ===
						true,
				)?.id ?? cusEnts[0]?.id)
			: undefined;

		// An unlimited grant absorbs the usage its allowance covers, so carried
		// usage must not reach a priced sibling and become billable overage.
		const unlimitedCusEnts = cusEnts.filter(isUnlimitedCusEnt);
		const hasUnlimitedGrant = unlimitedCusEnts.length > 0;
		const carryTargets = hasUnlimitedGrant ? unlimitedCusEnts : cusEnts;

		// Overage already exceeded its allowance on the source, so it was owed
		// before this transition and survives it even when the grant grows.
		const accruedOverage = hasUnlimitedGrant
			? (existingUsage.accruedOverage ?? 0)
			: 0;
		const absorbedUsage = new Decimal(existingUsage.usage)
			.sub(accruedOverage)
			.toNumber();

		// 1. Deduct entity usages
		for (const [entityId, entityUsage] of Object.entries(
			existingUsage.entityUsages,
		)) {
			deductFromCusEntsTypescript({
				cusEnts: carryTargets,
				amountToDeduct: entityUsage,
				targetEntityId: entityId,
				// Carried usage is never floored: prior usage above the new
				// allowance lands as a negative balance, not a silent reset.
				allowOverage: true,
			});
		}

		// 2. Deduct top level usages
		deductFromCusEntsTypescript({
			cusEnts: carryTargets,
			amountToDeduct: absorbedUsage,
			allowOverage: true,
		});

		// 3. Re-apply overage the source had already accrued to the priced rows
		if (accruedOverage > 0) {
			deductFromCusEntsTypescript({
				cusEnts: cusEnts.filter((cusEnt) => !isUnlimitedCusEnt(cusEnt)),
				amountToDeduct: accruedOverage,
				allowOverage: true,
			});
		}

		for (const newCusEnt of cusEnts) {
			const original = customerProduct.customer_entitlements.find(
				(ce) => ce.id === newCusEnt.id,
			);
			if (original) {
				original.balance = newCusEnt.balance;
				original.entities = newCusEnt.entities;
				original.adjustment = newCusEnt.adjustment;
				if (newCusEnt.id === attributionOwnerId) {
					original.usage_attribution = structuredClone(
						existingUsage.usageAttribution ?? {},
					);
				}

				ctx.logger.debug(`Deduction for feature ${newCusEnt.feature_id}:`, {
					balance: newCusEnt.balance,
					entities: newCusEnt.entities,
					adjustment: newCusEnt.adjustment,
				});
			}
		}
	}
};
