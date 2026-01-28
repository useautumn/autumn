import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	notNullish,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { workflows } from "@/queue/workflows.js";
import RecaseError from "@/utils/errorUtils.js";
import { FeatureService } from "../FeatureService.js";
import {
	validateCreditSystem,
	validateMeteredConfig,
} from "../featureUtils.js";
import { getObjectsUsingFeature } from "../utils/updateFeatureUtils/getObjectsUsingFeature.js";
import { handleFeatureIdChanged } from "../utils/updateFeatureUtils/handleFeatureIdChanged.js";
import { handleFeatureTypeChanged } from "../utils/updateFeatureUtils/handleFeatureTypeChanged.js";
import { handleFeatureUsageTypeChanged } from "../utils/updateFeatureUtils/handleFeatureUsageTypeChanged.js";
import type { ClearCreditSystemCachePayload } from "./runClearCreditSystemCacheTask.js";

interface UpdateFeatureParams {
	ctx: AutumnContext;
	featureId: string;
	updates: Partial<Feature>;
}

/**
 * Checks if the credit schema has changed between old and new config.
 * Returns true if schema changed (different items or different credit amounts).
 */
const hasCreditSchemaChanged = ({
	oldSchema,
	newSchema,
}: {
	oldSchema: CreditSchemaItem[] | undefined;
	newSchema: CreditSchemaItem[] | undefined;
}): boolean => {
	if (!oldSchema && !newSchema) return false;
	if (!oldSchema || !newSchema) return true;
	if (oldSchema.length !== newSchema.length) return true;

	// Create a map of old schema for quick lookup
	const oldSchemaMap = new Map(
		oldSchema.map((item) => [item.metered_feature_id, item.credit_amount]),
	);

	// Check if any item has changed
	for (const newItem of newSchema) {
		const oldAmount = oldSchemaMap.get(newItem.metered_feature_id);
		if (oldAmount === undefined || oldAmount !== newItem.credit_amount) {
			return true;
		}
	}

	return false;
};

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
		await workflows.triggerGenerateFeatureDisplay({
			featureId: updatedFeature.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}

	// Queue cache clear for credit system if schema changed
	if (
		feature.type === FeatureType.CreditSystem &&
		updates.config?.schema &&
		updatedFeature
	) {
		const schemaChanged = hasCreditSchemaChanged({
			oldSchema: feature.config?.schema,
			newSchema: updates.config.schema,
		});

		if (schemaChanged) {
			await addTaskToQueue({
				jobName: JobName.ClearCreditSystemCustomerCache,
				payload: {
					orgId: ctx.org.id,
					env: ctx.env,
					internalFeatureId: feature.internal_id,
				} satisfies ClearCreditSystemCachePayload,
			});
		}
	}

	return updatedFeature;
};
