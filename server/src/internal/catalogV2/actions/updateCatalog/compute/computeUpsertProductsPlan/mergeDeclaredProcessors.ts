import {
	type ApiRevenueCatPlanProcessor,
	type ApiStripePlanProcessor,
	ErrCode,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { ProductUpsertIntent } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

/** A stated Stripe mapping: an object links, `null` unlinks. Absent = not stated. */
type StatedStripe = ApiStripePlanProcessor | null;

/** Order-insensitive identity of a stated mapping, for collision detection. */
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

/**
 * Two entries stating different mappings for one plan is an ambiguity, not a
 * race — whichever the fold visited first would win silently.
 */
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
	/** Stated on a plan's own entry — the strongest claim on that plan. */
	byPlanId: Map<string, StatedStripe>;
	/** Stated on someone's `variants[]` — an override of that base's mapping. */
	byVariantPlanId: Map<string, StatedStripe>;
};

/**
 * RevenueCat mappings are plan-wide, so they never fan out across a lineage —
 * but two versions of one plan stating different product sets still race in
 * the mappings table, which is the same ambiguity.
 */
const assertRevenueCatMappingsAgree = ({
	plans,
}: {
	plans: UpdateCatalogParams["plans"];
}): void => {
	const statedByPlanId = new Map<string, ApiRevenueCatPlanProcessor | null>();
	for (const entry of plans) {
		const revenuecat = entry.processors?.revenuecat;
		if (revenuecat === undefined) continue;
		claimStatedMapping({
			statedByPlanId,
			planId: entry.plan_id,
			stated: revenuecat,
			identity: revenueCatMappingIdentity,
			processorName: "revenuecat",
		});
	}
};

const indexStatedStripe = ({
	plans,
}: {
	plans: UpdateCatalogParams["plans"];
}): StatedStripeIndex => {
	const byPlanId = new Map<string, StatedStripe>();
	const byVariantPlanId = new Map<string, StatedStripe>();

	for (const entry of plans) {
		const stripe = entry.processors?.stripe;
		if (stripe !== undefined) {
			claimStatedMapping({
				statedByPlanId: byPlanId,
				planId: entry.plan_id,
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

/**
 * Variant plan id → the plan it bills under. Persisted pointers first (newest
 * row wins), then this call's own pointer writes, which are the state the
 * mapping has to hold in.
 */
const indexBasePlanIds = ({
	plans,
	productStatesContext,
}: {
	plans: UpdateCatalogParams["plans"];
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

/** Own entry, then an override aimed at it, then whatever its base states. */
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

/**
 * Every version of a plan, and every variant that follows it, bills under one
 * Stripe product. Derived `processor_sync` / `variant_propagation` intents
 * carry that across the lineage, but they are dropped for any row the payload
 * already named — first claim wins, and every direct entry is claimed before
 * the fold starts. So fill the stated mapping into those pending direct
 * intents here instead, leaving the derived fan-out to cover only the rows the
 * payload did not name.
 *
 * A row that states its own `processors.stripe` keeps it, including a `null`
 * unlink; only rows that stated nothing are filled.
 */
export const mergeDeclaredProcessors = ({
	intents,
	params,
	productStatesContext,
}: {
	intents: ProductUpsertIntent[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	assertRevenueCatMappingsAgree({ plans: params.plans });

	const statedStripe = indexStatedStripe({ plans: params.plans });
	if (
		statedStripe.byPlanId.size === 0 &&
		statedStripe.byVariantPlanId.size === 0
	) {
		return intents;
	}

	const basePlanIdByPlanId = indexBasePlanIds({
		plans: params.plans,
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
