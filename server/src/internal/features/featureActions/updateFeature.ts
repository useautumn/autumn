import {
	type CreditSystemConfig,
	ErrCode,
	entToPrice,
	type Feature,
	FeatureAlreadyExistsError,
	FeatureType,
	type FeatureUpdateBlocker,
	isAiCreditSystem,
	isAnyCreditSystem,
	isConsumablePrice,
	type ModelMarkups,
	notNullish,
	toProductItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { workflows } from "@/queue/workflows.js";
import RecaseError from "@/utils/errorUtils.js";
import { isEnablingInvoiceCreditFeature } from "../creditSystemUtils.js";
import { FeatureService } from "../FeatureService.js";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
	validateMeteredConfig,
} from "../featureUtils.js";
import { detectFeatureUpdateBlockers } from "../utils/updateFeatureUtils/detectFeatureUpdateBlockers.js";
import { getObjectsUsingFeature } from "../utils/updateFeatureUtils/getObjectsUsingFeature.js";
import { handleFeatureIdChanged } from "../utils/updateFeatureUtils/handleFeatureIdChanged.js";
import { handleFeatureTypeChanged } from "../utils/updateFeatureUtils/handleFeatureTypeChanged.js";
import { handleFeatureUsageTypeChanged } from "../utils/updateFeatureUtils/handleFeatureUsageTypeChanged.js";
import {
	validateInvoiceCreditPooling,
	validateInvoiceCreditPrice,
	validateInvoiceCreditUsageBasedPricing,
} from "../validateInvoiceCreditPooling.js";
import { hasCreditRateCardChanged } from "./hasCreditRateCardChanged.js";
import type { ClearCreditSystemCachePayload } from "./runClearCreditSystemCacheTask.js";

interface UpdateFeatureParams {
	ctx: AutumnContext;
	featureId: string;
	updates: Partial<Feature>;
}

/** Generic keyed-record equality check with a caller-supplied per-entry comparison. */
const areMarkupRecordsEqual = <T>(
	a: Record<string, T> | null | undefined,
	b: Record<string, T> | null | undefined,
	entriesEqual: (aEntry: T, bEntry: T) => boolean,
): boolean => {
	const aIsAbsent = a == null;
	const bIsAbsent = b == null;
	if (aIsAbsent && bIsAbsent) return true;
	if (aIsAbsent || bIsAbsent) return false;

	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;

	for (const key of aKeys) {
		const aEntry = a[key];
		const bEntry = b[key];
		if (!bEntry) return false;
		if (!entriesEqual(aEntry, bEntry)) return false;
	}

	return true;
};

const areModelMarkupsEqual = ({
	a,
	b,
}: {
	a: ModelMarkups;
	b: ModelMarkups;
}): boolean =>
	areMarkupRecordsEqual<NonNullable<ModelMarkups>[string]>(
		a,
		b,
		(aEntry, bEntry) =>
			aEntry.markup === bEntry.markup &&
			aEntry.input_cost === bEntry.input_cost &&
			aEntry.output_cost === bEntry.output_cost,
	);

const areProviderMarkupsEqual = ({
	a,
	b,
}: {
	a: CreditSystemConfig["provider_markups"];
	b: CreditSystemConfig["provider_markups"];
}): boolean =>
	areMarkupRecordsEqual<
		NonNullable<CreditSystemConfig["provider_markups"]>[string]
	>(a, b, (aEntry, bEntry) => aEntry.markup === bEntry.markup);

const hasAiMarkupConfigChanged = ({
	oldConfig,
	newConfig,
}: {
	oldConfig: CreditSystemConfig | undefined;
	newConfig: CreditSystemConfig | undefined;
}): boolean => {
	if (
		(oldConfig?.default_markup ?? undefined) !==
		(newConfig?.default_markup ?? undefined)
	) {
		return true;
	}

	return !areProviderMarkupsEqual({
		a: oldConfig?.provider_markups,
		b: newConfig?.provider_markups,
	});
};

/** Reproduce the exact error `updateFeature` historically threw for a blocker. */
export const throwFeatureUpdateBlocker = ({
	blocker,
	newId,
}: {
	blocker: FeatureUpdateBlocker;
	newId?: string;
}): never => {
	if (blocker.code === "id_already_exists" && newId) {
		throw new FeatureAlreadyExistsError({ featureId: newId });
	}
	throw new RecaseError({
		message: blocker.message,
		code:
			blocker.code === "type_switch_credit_system"
				? undefined
				: ErrCode.InvalidFeature,
		statusCode: 400,
	});
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
	const nextFeature = {
		...feature,
		type: updates.type ?? feature.type,
		config: updates.config ?? feature.config,
	};
	const isEnablingInvoiceCredits = isEnablingInvoiceCreditFeature({
		currentFeature: feature,
		nextFeature,
	});

	if (
		isChangingType ||
		isChangingId ||
		isChangingUsageType ||
		isEnablingInvoiceCredits
	) {
		const objectsUsingFeature = await getObjectsUsingFeature({
			ctx,
			feature,
		});

		validateInvoiceCreditPooling({
			feature: nextFeature,
			pooled:
				isEnablingInvoiceCredits &&
				objectsUsingFeature.entitlements.some(
					(entitlement) => entitlement.pooled,
				),
		});
		validateInvoiceCreditUsageBasedPricing({
			feature: nextFeature,
			usageBased: objectsUsingFeature.entitlements.every((entitlement) => {
				const price = entToPrice({
					ent: entitlement,
					prices: objectsUsingFeature.prices,
				});
				return price !== undefined && isConsumablePrice(price);
			}),
		});
		if (isEnablingInvoiceCredits) {
			for (const entitlement of objectsUsingFeature.entitlements) {
				const price = entToPrice({
					ent: entitlement,
					prices: objectsUsingFeature.prices,
				});
				if (!price) continue;
				validateInvoiceCreditPrice({
					feature: nextFeature,
					item: toProductItem({ ent: entitlement, price }),
				});
			}
		}

		// Validate the whole change before any mutation so it stays atomic.
		const [blocker] = detectFeatureUpdateBlockers({
			feature,
			updates,
			objectsUsingFeature,
			allFeatures,
		});
		if (blocker) {
			throwFeatureUpdateBlocker({ blocker, newId: updates.id });
		}

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

	const effectiveType = updates.type ?? feature.type;

	const newConfig = (() => {
		if (updates.config === undefined) return feature.config;
		switch (effectiveType) {
			case FeatureType.AiCreditSystem:
			case FeatureType.CreditSystem: {
				const validatedConfig = validateCreditSystem(
					updates.config,
					effectiveType,
				);
				if (effectiveType === FeatureType.CreditSystem) {
					validateCreditSystemSchemaReferences({
						config: validatedConfig,
						allFeatures,
						selfFeatureId: updates.id ?? feature.id,
					});
				}
				return validatedConfig;
			}
			case FeatureType.Metered:
				return validateMeteredConfig(updates.config);
			default:
				return updates.config;
		}
	})();

	const isCreditSystem = isAnyCreditSystem(feature.type);
	const rateCardChanged =
		isCreditSystem &&
		updates.config != null &&
		hasCreditRateCardChanged({
			oldConfig: feature.config,
			newConfig,
		});
	const markupsChanged =
		isCreditSystem &&
		updates.model_markups !== undefined &&
		!areModelMarkupsEqual({
			a: updates.model_markups,
			b: feature.model_markups,
		});
	const aiMarkupConfigChanged =
		isAiCreditSystem(feature.type) &&
		updates.config != null &&
		hasAiMarkupConfigChanged({
			oldConfig: feature.config,
			newConfig,
		});
	const shouldClearCreditSystemCustomerCache =
		rateCardChanged || markupsChanged || aiMarkupConfigChanged;

	// Update the feature
	const updatedFeature = await FeatureService.update({
		db: ctx.db,
		id: featureId,
		orgId: ctx.org.id,
		env: ctx.env,
		updates: {
			id: updates.id,
			name: updates.name,
			type: effectiveType,
			archived: updates.archived,
			event_names: updates.event_names,
			config: newConfig,
			model_markups: updates.model_markups,
			display: updates.display,
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

	if (shouldClearCreditSystemCustomerCache && updatedFeature) {
		await addTaskToQueue({
			jobName: JobName.ClearCreditSystemCustomerCache,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				internalFeatureId: feature.internal_id,
			} satisfies ClearCreditSystemCachePayload,
		});
	}

	return updatedFeature;
};
