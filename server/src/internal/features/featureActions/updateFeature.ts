import { ErrCode, type Feature, FeatureType, notNullish } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { FeatureService } from "../FeatureService.js";
import {
	validateCreditSystem,
	validateMeteredConfig,
} from "../featureUtils.js";
import { getObjectsUsingFeature } from "../handlers/handleUpdateFeature/getObjectsUsingFeature.js";
import { handleFeatureIdChanged } from "../handlers/handleUpdateFeature/handleFeatureIdChanged.js";
import { handleFeatureTypeChanged } from "../handlers/handleUpdateFeature/handleFeatureTypeChanged.js";
import { handleFeatureUsageTypeChanged } from "../handlers/handleUpdateFeature/handleFeatureUsageTypeChanged.js";

interface UpdateFeatureParams {
	ctx: AutumnContext;
	featureId: string;
	updates: Partial<Feature>;
}

/**
 * Updates an existing feature with full validation logic
 */
export const updateFeature = async ({
	ctx,
	featureId,
	updates,
}: UpdateFeatureParams): Promise<Feature | null> => {
	// 1. Get all features and find the one to update
	const allFeatures = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const feature = allFeatures.find((f) => f.id === featureId);

	if (!feature) {
		throw new RecaseError({
			message: `Feature ${featureId} not found`,
			code: ErrCode.InvalidFeature,
			statusCode: 404,
		});
	}

	// Check if changing type, id, or usage type
	const isChangingType =
		notNullish(updates.type) && feature.type !== updates.type;

	const isChangingId = notNullish(updates.id) && feature.id !== updates.id;

	const isChangingUsageType =
		feature.type !== FeatureType.Boolean &&
		updates.type !== FeatureType.Boolean &&
		feature.config?.usage_type !== updates.config?.usage_type;

	const isChangingName = updates.name && feature.name !== updates.name;

	if (isChangingType || isChangingId || isChangingUsageType) {
		const objectsUsingFeature = await getObjectsUsingFeature({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			allFeatures,
			feature,
		});

		// Handle type change
		if (isChangingType && updates.type) {
			await handleFeatureTypeChanged({
				ctx,
				objectsUsingFeature,
				feature,
				newType: updates.type,
			});
		}

		const { linkedEntitlements, entitlements, prices, creditSystems } =
			objectsUsingFeature;

		// Handle ID change
		if (isChangingId && updates.id) {
			await handleFeatureIdChanged({
				ctx,
				feature,
				linkedEntitlements,
				entitlements,
				prices,
				creditSystems,
				newId: updates.id,
			});
		}

		// Handle usage type change
		if (isChangingUsageType && updates.config?.usage_type) {
			await handleFeatureUsageTypeChanged({
				db: ctx.db,
				feature,
				linkedEntitlements,
				entitlements,
				prices,
				creditSystems,
				newUsageType: updates.config.usage_type,
			});
		}
	}

	// Validate config based on feature type
	const newConfig =
		updates.config !== undefined
			? feature.type === FeatureType.CreditSystem
				? validateCreditSystem(updates.config)
				: feature.type === FeatureType.Metered
					? validateMeteredConfig(updates.config)
					: updates.config
			: feature.config;

	// Update the feature
	const updatedFeature = await FeatureService.update({
		db: ctx.db,
		id: featureId,
		orgId: ctx.org.id,
		env: ctx.env,
		updates: {
			id: updates.id,
			name: updates.name,
			type: updates.type,
			archived: updates.archived,
			event_names: updates.event_names,
			config: newConfig,
		},
	});

	// Queue display generation if name changed
	if (isChangingName && updatedFeature) {
		await addTaskToQueue({
			jobName: JobName.GenerateFeatureDisplay,
			payload: {
				feature: updatedFeature,
				org: ctx.org,
			},
		});
	}

	return updatedFeature;
};
