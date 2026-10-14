import {
	type ApiRevenueCatPlanProcessor,
	type ApiStripePlanProcessor,
	ErrCode,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { ProductUpsertIntent } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

const currentPlanId = ({
	entry,
	internalIdRefs,
}: {
	entry: NonNullable<UpdateCatalogParams["plans"]>[number];
	internalIdRefs: InternalIdRefs;
}): string =>
	(entry.internal_id
		? internalIdRefs.get(entry.internal_id)?.planId
		: undefined) ?? entry.plan_id;

type StatedStripe = ApiStripePlanProcessor | null;

const stripeMappingIdentity = (stated: StatedStripe): string =>
	stated === null
		? "null"
		: `${stated.product_id}|${[...(stated.additional_product_ids ?? [])]
				.sort()
				.join(",")}`;

const revenueCatMappingIdentity = (
	stated: ApiRevenueCatPlanProcessor | null,
): string =>
	stated === null
		? "null"
		: stated.products
				.map((product) =>
					[
						product.product_id,
						(product.feature_quantities ?? [])
							.map((entry) => `${entry.feature_id}=${entry.quantity ?? ""}`)
							.sort()
							.join(","),
					].join(":"),
				)
				.sort()
				.join("|");

const claimStatedMapping = <T>({
	statedByPlanId,
	planId,
	stated,
	identity,
	processorName,
}: {
	statedByPlanId: Map<string, T>;
	planId: string;
	stated: T;
	identity: (stated: T) => string;
	processorName: string;
}): void => {
	const existing = statedByPlanId.get(planId);
	if (existing !== undefined && identity(existing) !== identity(stated)) {
		throw new RecaseError({
			message: `Conflicting processors.${processorName} for plan_id=${planId}: two entries state different mappings`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	statedByPlanId.set(planId, stated);
};

type StatedStripeIndex = {
	byPlanId: Map<string, StatedStripe>;
	byVariantPlanId: Map<string, StatedStripe>;
};

const assertRevenueCatMappingsAgree = ({
	plans,
	internalIdRefs,
}: {
	plans: NonNullable<UpdateCatalogParams["plans"]>;
	internalIdRefs: InternalIdRefs;
}): void => {
	const statedByPlanId = new Map<string, ApiRevenueCatPlanProcessor | null>();
	for (const entry of plans) {
		const revenuecat = entry.processors?.revenuecat;
		if (revenuecat === undefined) continue;
		claimStatedMapping({
			statedByPlanId,
			planId: currentPlanId({ entry, internalIdRefs }),
			stated: revenuecat,
			identity: revenueCatMappingIdentity,
			processorName: "revenuecat",
		});
	}
};

const indexStatedStripe = ({
	plans,
	internalIdRefs,
}: {
	plans: NonNullable<UpdateCatalogParams["plans"]>;
	internalIdRefs: InternalIdRefs;
}): StatedStripeIndex => {
	const byPlanId = new Map<string, StatedStripe>();
	const byVariantPlanId = new Map<string, StatedStripe>();

	for (const entry of plans) {
		const stripe = entry.processors?.stripe;
		if (stripe !== undefined) {
			claimStatedMapping({
				statedByPlanId: byPlanId,
				planId: currentPlanId({ entry, internalIdRefs }),
				stated: stripe,
				identity: stripeMappingIdentity,
				processorName: "stripe",
			});
		}

		for (const variant of entry.variants ?? []) {
			const variantStripe = variant.processors?.stripe;
			if (variantStripe === undefined) continue;
			claimStatedMapping({
				statedByPlanId: byVariantPlanId,
				planId: variant.variant_plan_id,
				stated: variantStripe,
				identity: stripeMappingIdentity,
				processorName: "stripe",
			});
		}
	}

	return { byPlanId, byVariantPlanId };
};

const indexBasePlanIds = ({
	plans,
	productStatesContext,
}: {
	plans: NonNullable<UpdateCatalogParams["plans"]>;
	productStatesContext: ProductStatesContext;
}): Map<string, string> => {
	const basePlanIdByPlanId = new Map<string, string>();

	for (const [planId, versions] of Object.entries(
		productStatesContext.versionsByPlanId,
	)) {
		for (const product of versions) {
			if (!product.base_internal_product_id) continue;
			const base = findFullProductByInternalId({
				internalId: product.base_internal_product_id,
				productStatesContext,
			});
			if (!base || base.id === planId) continue;
			basePlanIdByPlanId.set(planId, base.id);
			break;
		}
	}

	for (const entry of plans) {
		for (const variant of entry.variants ?? []) {
			if (variant.variant_plan_id === entry.plan_id) continue;
			if (variant.base_variant_id === null) {
				basePlanIdByPlanId.delete(variant.variant_plan_id);
				continue;
			}
			basePlanIdByPlanId.set(variant.variant_plan_id, entry.plan_id);
		}

		if (entry.base_variant_id === null) {
			basePlanIdByPlanId.delete(entry.plan_id);
		} else if (entry.base_variant_id !== undefined) {
			basePlanIdByPlanId.set(entry.plan_id, entry.base_variant_id);
		}
	}

	return basePlanIdByPlanId;
};

const resolveStatedStripe = ({
	planId,
	statedStripe,
	basePlanIdByPlanId,
}: {
	planId: string;
	statedStripe: StatedStripeIndex;
	basePlanIdByPlanId: Map<string, string>;
}): StatedStripe | undefined => {
	const visitedPlanIds = new Set<string>();
	let currentPlanId: string | undefined = planId;

	while (currentPlanId !== undefined && !visitedPlanIds.has(currentPlanId)) {
		visitedPlanIds.add(currentPlanId);
		const ownStated = statedStripe.byPlanId.get(currentPlanId);
		if (ownStated !== undefined) return ownStated;
		const overrideStated = statedStripe.byVariantPlanId.get(currentPlanId);
		if (overrideStated !== undefined) return overrideStated;
		currentPlanId = basePlanIdByPlanId.get(currentPlanId);
	}

	return undefined;
};

export const mergeDeclaredProcessors = ({
	intents,
	params,
	productStatesContext,
	internalIdRefs,
}: {
	intents: ProductUpsertIntent[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): ProductUpsertIntent[] => {
	assertRevenueCatMappingsAgree({ plans: params.plans ?? [], internalIdRefs });

	const statedStripe = indexStatedStripe({
		plans: params.plans ?? [],
		internalIdRefs,
	});
	if (
		statedStripe.byPlanId.size === 0 &&
		statedStripe.byVariantPlanId.size === 0
	) {
		return intents;
	}

	const basePlanIdByPlanId = indexBasePlanIds({
		plans: params.plans ?? [],
		productStatesContext,
	});

	return intents.map((intent) => {
		if (intent.planParams.processors?.stripe !== undefined) return intent;

		const stated = resolveStatedStripe({
			planId: intent.productKey.planId,
			statedStripe,
			basePlanIdByPlanId,
		});
		if (stated === undefined) return intent;

		return {
			...intent,
			planParams: {
				...intent.planParams,
				processors: { ...intent.planParams.processors, stripe: stated },
			},
		};
	});
};
