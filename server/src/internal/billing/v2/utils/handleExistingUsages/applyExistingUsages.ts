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
import { isInvoiceCreditCustomerEntitlement } from "@/internal/features/invoiceCredits/isInvoiceCreditCustomerEntitlement.js";
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
			? (cusEnts.find((customerEntitlement) =>
					isInvoiceCreditCustomerEntitlement({ customerEntitlement }),
				)?.id ?? cusEnts[0]?.id)
			: undefined;

		const unlimitedCusEnts = cusEnts.filter(isUnlimitedCusEnt);
		const hasUnlimitedGrant = unlimitedCusEnts.length > 0;
		const carryTargets = hasUnlimitedGrant ? unlimitedCusEnts : cusEnts;

		const accruedOverage = hasUnlimitedGrant
			? (existingUsage.accruedOverage ?? 0)
			: 0;
		const absorbedUsage = new Decimal(existingUsage.usage)
			.sub(accruedOverage)
			.toNumber();

		for (const [entityId, entityUsage] of Object.entries(
			existingUsage.entityUsages,
		)) {
			deductFromCusEntsTypescript({
				cusEnts: carryTargets,
				amountToDeduct: entityUsage,
				targetEntityId: entityId,
				allowOverage: true,
			});
		}

		deductFromCusEntsTypescript({
			cusEnts: carryTargets,
			amountToDeduct: absorbedUsage,
			allowOverage: true,
		});

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
