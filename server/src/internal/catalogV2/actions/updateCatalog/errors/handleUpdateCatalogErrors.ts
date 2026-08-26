import {
	entToPrice,
	type Feature,
	isConsumablePrice,
	toProductItem,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRemoveFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemoveFeatureErrors/handleRemoveFeatureErrors";
import { handleRemovePlanErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemovePlanErrors/handleRemovePlanErrors";
import { handleUpdateFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/handleUpdateFeatureErrors";
import { handleUpsertProductActiveErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductActiveErrors";
import { handleUpsertProductErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleUpsertProductErrors";
import { handleUpsertProductRenameErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductRenameErrors";
import { handleUpsertProductVersioningErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersioningErrors";
import { handleUpsertProductVersionSlugErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersionSlugErrors";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import {
	validateInvoiceCreditPooling,
	validateInvoiceCreditPrice,
	validateInvoiceCreditUsageBasedPricing,
} from "@/internal/features/validateInvoiceCreditPooling.js";

const planItemsForFeatureAreUsageBased = ({
	internalFeatureId,
	updateCatalogPlan,
}: {
	internalFeatureId: string;
	updateCatalogPlan: UpdateCatalogPlan;
}): boolean =>
	updateCatalogPlan.projected.products.every((product) =>
		product.entitlements
			.filter(
				(entitlement) => entitlement.internal_feature_id === internalFeatureId,
			)
			.every((entitlement) => {
				const price = entToPrice({ ent: entitlement, prices: product.prices });
				return price !== undefined && isConsumablePrice(price);
			}),
	);

const validateProjectedInvoiceCreditPrices = ({
	feature,
	updateCatalogPlan,
}: {
	feature: Feature;
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	for (const product of updateCatalogPlan.projected.products) {
		for (const entitlement of product.entitlements) {
			if (entitlement.internal_feature_id !== feature?.internal_id) continue;
			const price = entToPrice({ ent: entitlement, prices: product.prices });
			if (!price) continue;
			validateInvoiceCreditPrice({
				feature,
				item: toProductItem({ ent: entitlement, price }),
			});
		}
	}
};

const validateProjectedInvoiceCreditPooling = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const projectedPlanIds = new Set(
		Object.keys(catalogContext.productStatesContext.versionsByPlanId),
	);
	const validationCatalogPlan = {
		...updateCatalogPlan,
		projected: {
			...updateCatalogPlan.projected,
			products: [
				...catalogContext.invoiceCreditProducts.filter(
					(product) => !projectedPlanIds.has(product.id),
				),
				...updateCatalogPlan.projected.products,
			],
		},
	};

	for (const updateFeaturePlan of validationCatalogPlan.updateFeatures) {
		const { next: feature } = updateFeaturePlan;
		const hasPooledPlanItem = validationCatalogPlan.projected.products.some(
			(product) =>
				product.entitlements.some(
					(entitlement) =>
						entitlement.internal_feature_id === feature.internal_id &&
						entitlement.pooled,
				),
		);
		validateInvoiceCreditPooling({
			feature,
			pooled: hasPooledPlanItem,
		});
		validateInvoiceCreditUsageBasedPricing({
			feature,
			usageBased: planItemsForFeatureAreUsageBased({
				internalFeatureId: feature.internal_id,
				updateCatalogPlan: validationCatalogPlan,
			}),
		});
		validateProjectedInvoiceCreditPrices({
			feature,
			updateCatalogPlan: validationCatalogPlan,
		});
	}

	for (const feature of validationCatalogPlan.insertFeatures) {
		const hasPooledPlanItem = validationCatalogPlan.projected.products.some(
			(product) =>
				product.entitlements.some(
					(entitlement) =>
						entitlement.internal_feature_id === feature.internal_id &&
						entitlement.pooled,
				),
		);
		validateInvoiceCreditPooling({ feature, pooled: hasPooledPlanItem });
		validateInvoiceCreditUsageBasedPricing({
			feature,
			usageBased: planItemsForFeatureAreUsageBased({
				internalFeatureId: feature.internal_id,
				updateCatalogPlan: validationCatalogPlan,
			}),
		});
		validateProjectedInvoiceCreditPrices({
			feature,
			updateCatalogPlan: validationCatalogPlan,
		});
	}
};

/** Throws on anything that should fail the whole batch before any write. */
export const handleUpdateCatalogErrors = async ({
	ctx,
	catalogContext,
	updateCatalogPlan,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
	params: UpdateCatalogParams;
}): Promise<void> => {
	handleUpdateFeatureErrors({ ctx, catalogContext, updateCatalogPlan });
	validateProjectedInvoiceCreditPooling({ catalogContext, updateCatalogPlan });
	handleRemoveFeatureErrors({ updateCatalogPlan });
	handleRemovePlanErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
	handleUpsertProductVersioningErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	await handleUpsertProductRenameErrors({
		ctx,
		params,
		productStatesContext: catalogContext.productStatesContext,
		updateCatalogPlan,
	});
	handleUpsertProductVersionSlugErrors({ updateCatalogPlan });
	handleUpsertProductActiveErrors({ params });
	handleUpsertProductErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
};
