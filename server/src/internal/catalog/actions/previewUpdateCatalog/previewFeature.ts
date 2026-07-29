import {
	ApiVersion,
	ApiVersionClass,
	dbToApiFeatureV1,
	diffFeatureV1,
	expandPathIncludes,
	type Feature,
	type FullProduct,
	type FeatureUpdateBlocker,
	type PreviewUpdateFeatureReason,
	type PreviewUpdateFeatureResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	detectFeatureUpdateBlockers,
	isBlockableFeatureChange,
} from "@/internal/features/utils/updateFeatureUtils/detectFeatureUpdateBlockers.js";
import { getObjectsUsingFeature } from "@/internal/features/utils/updateFeatureUtils/getObjectsUsingFeature.js";

const FEATURE_TARGET_VERSION = new ApiVersionClass(ApiVersion.V2_1);
const FEATURE_EXPAND = "feature";

export const featurePreviewReason = ({
	blockers,
}: {
	blockers: FeatureUpdateBlocker[];
}): PreviewUpdateFeatureReason => {
	const codes = blockers.map((blocker) => blocker.code);

	if (codes.includes("attached_to_customer")) return "has_customers";
	if (codes.includes("used_in_product_credit_system")) return "used_in_products";
	if (codes.includes("used_in_credit_system")) return "used_in_credit_system";
	if (codes.includes("has_usage_price")) return "has_usage_price";
	if (codes.includes("id_already_exists")) return "id_already_exists";
	if (codes.includes("type_switch_credit_system")) {
		return "credit_system_type_change";
	}
	if (codes.length > 0) return "unsupported_dependency";

	return null;
};

export const getFeatureUpdateBlockedReason = async ({
	ctx,
	existing,
	updates,
	products,
}: {
	ctx: AutumnContext;
	existing: Feature | null;
	updates: Feature;
	products: FullProduct[];
}): Promise<PreviewUpdateFeatureReason> => {
	if (
		!existing ||
		!isBlockableFeatureChange({ feature: existing, updates })
	) {
		return null;
	}

	return featurePreviewReason({
		blockers: detectFeatureUpdateBlockers({
			feature: existing,
			updates,
			objectsUsingFeature: await getObjectsUsingFeature({
				ctx,
				feature: existing,
				products,
			}),
			allFeatures: ctx.features,
		}),
	});
};

const shouldExpandFeature = (ctx: AutumnContext) =>
	expandPathIncludes({
		expand: ctx.expand,
		includes: [FEATURE_EXPAND],
	});

const featureRemovalReason = async ({
	ctx,
	feature,
	products,
}: {
	ctx: AutumnContext;
	feature: Feature;
	products: FullProduct[];
}): Promise<PreviewUpdateFeatureReason> => {
	const objectsUsingFeature = await getObjectsUsingFeature({
		ctx,
		feature,
		products,
	});

	if (objectsUsingFeature.cusEnts.length > 0) {
		return "has_customers";
	}
	if (objectsUsingFeature.creditSystems.length > 0) {
		return "used_in_credit_system";
	}
	if (objectsUsingFeature.entitlements.length > 0) {
		return "used_in_products";
	}
	if (objectsUsingFeature.prices.length > 0) {
		return "has_usage_price";
	}

	return null;
};

/**
 * Resolve a single proposed feature change without persisting: the resulting
 * feature plus any conditions that would block `updateFeature` from applying it.
 */
export const previewFeature = async ({
	ctx,
	dbFeature,
	existing,
	products,
}: {
	ctx: AutumnContext;
	dbFeature: Feature;
	existing: Feature | null;
	products: FullProduct[];
}): Promise<PreviewUpdateFeatureResponse> => {
	const feature = dbToApiFeatureV1({
		ctx,
		dbFeature,
		targetVersion: FEATURE_TARGET_VERSION,
	});
	const currentFeature = existing
		? dbToApiFeatureV1({
				ctx,
				dbFeature: existing,
				targetVersion: FEATURE_TARGET_VERSION,
			})
		: null;

	const blockedReason = await getFeatureUpdateBlockedReason({
		ctx,
		existing,
		updates: dbFeature,
		products,
	});
	const previousAttributes = currentFeature
		? diffFeatureV1({
				from: currentFeature,
				to: feature,
			}).previous_attributes
		: null;
	const action = !existing
		? "create"
		: previousAttributes
			? "update"
			: "none";
	const featureChanges: PreviewUpdateFeatureResponse = {
		feature_id: dbFeature.id,
		action,
		will_archive: false,
		blocked: blockedReason !== null,
		blocked_reason: blockedReason,
		previous_attributes: previousAttributes,
		...(shouldExpandFeature(ctx) ? { feature } : {}),
	};

	return featureChanges;
};

export const previewRemoveFeature = async ({
	ctx,
	featureId,
	products,
}: {
	ctx: AutumnContext;
	featureId: string;
	products: FullProduct[];
}): Promise<PreviewUpdateFeatureResponse> => {
	const feature = ctx.features.find((candidate) => candidate.id === featureId);
	if (!feature) {
		return {
			feature_id: featureId,
			action: "none",
			will_archive: false,
			blocked: true,
			blocked_reason: "unsupported_dependency",
			previous_attributes: null,
			...(shouldExpandFeature(ctx) ? { feature: null } : {}),
		};
	}

	const reason = await featureRemovalReason({ ctx, feature, products });
	const apiFeature = dbToApiFeatureV1({
		ctx,
		dbFeature: feature,
		targetVersion: FEATURE_TARGET_VERSION,
	});

	return {
		feature_id: featureId,
		action: "remove",
		will_archive: reason !== null,
		blocked: false,
		blocked_reason: null,
		previous_attributes: {
			id: apiFeature.id,
			name: apiFeature.name,
			type: apiFeature.type,
		},
		...(shouldExpandFeature(ctx) ? { feature: null } : {}),
	};
};

export const previewSkippedFeature = ({
	ctx,
	featureId,
	existing,
}: {
	ctx: AutumnContext;
	featureId: string;
	existing?: Feature | null;
}): PreviewUpdateFeatureResponse => ({
	feature_id: featureId,
	action: "skipped",
	will_archive: false,
	blocked: false,
	blocked_reason: null,
	previous_attributes: null,
	...(shouldExpandFeature(ctx)
		? {
				feature: existing
					? dbToApiFeatureV1({
							ctx,
							dbFeature: existing,
							targetVersion: FEATURE_TARGET_VERSION,
						})
					: null,
			}
		: {}),
});
