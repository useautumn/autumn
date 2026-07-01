// @ts-nocheck - Using ts-nocheck due to complex Record<string, unknown> index signature issues
import type {
	CustomizePlan,
	Feature,
	Plan,
	PlanItem,
	PlanItemFilter,
	Variant,
} from "../../compose/models/index.js";
import type {
	CatalogPreviewUpdateResponse,
	CatalogUpdateParams,
} from "../../lib/api/endpoints/index.js";
import {
	archiveFeature as archiveFeatureApi,
	archivePlan as archivePlanApi,
	createPlan,
	deleteFeature as deleteFeatureApi,
	deletePlan as deletePlanApi,
	fetchFeatures,
	fetchPlans,
	getFeatureDeletionInfo,
	getPlanDeletionInfo,
	getPlanHasCustomers,
	migrateProduct,
	previewUpdateCatalog,
	unarchiveFeature as unarchiveFeatureApi,
	unarchivePlan as unarchivePlanApi,
	updateCatalog,
	updateFeature,
	updatePlan,
	upsertFeature,
} from "../../lib/api/endpoints/index.js";
import { isProd } from "../../lib/env/cliContext.js";
import { AppEnv, getKey } from "../../lib/env/index.js";
import {
	transformApiFeature,
	transformApiPlans,
} from "../../lib/transforms/apiToSdk/index.js";
import {
	transformFeatureToApi,
	transformPlanItem,
	transformPlanToApi,
} from "../../lib/transforms/sdkToApi/index.js";
import { writeConfig } from "../pull/writeConfig.js";
import type {
	FeatureDeleteInfo,
	PlanDeleteInfo,
	PlanMigrationSelections,
	PlanUpdateInfo,
	PlanUpdateIntentSelections,
	PushAnalysis,
	PushResult,
	RemoteData,
	VariantMigrationSelections,
	VariantPropagationSelections,
	VariantUpdateIntentSelections,
} from "./types.js";
import {
	getDirectVariantUpdatePreviews,
	getVariantPropagationPreviews,
} from "./variantPropagation.js";

/**
 * Get the secret key for the current environment
 */
function getSecretKey(): string {
	const environment = isProd() ? AppEnv.Live : AppEnv.Sandbox;
	return getKey(environment);
}

/**
 * Core push logic - pure functions with no UI/prompts
 * All functions throw on error for proper React error handling
 */

// Fetch all features and plans from remote
export async function fetchRemoteData({
	allVersions = false,
}: {
	allVersions?: boolean;
} = {}): Promise<RemoteData> {
	const secretKey = getSecretKey();

	const [apiFeatures, apiPlans] = await Promise.all([
		fetchFeatures({ secretKey, includeArchived: true }),
		fetchPlans({ secretKey, includeArchived: true, allVersions }),
	]);

	return {
		features: apiFeatures.map(transformApiFeature),
		plans: transformApiPlans(apiPlans),
	};
}

type VersionedPlanIdentity = Pick<Plan, "id"> & { version?: number };

export const planTargetKey = ({ id, version }: VersionedPlanIdentity) =>
	version === undefined ? id : `${id}@v${version}`;

export const buildLatestPlanVersionById = (plans: VersionedPlanIdentity[]) => {
	const latestById = new Map<string, number>();
	for (const plan of plans) {
		if (plan.version === undefined) continue;
		latestById.set(
			plan.id,
			Math.max(latestById.get(plan.id) ?? plan.version, plan.version),
		);
	}
	return latestById;
};

export const isHistoricalPlan = ({
	latestVersionById,
	plan,
}: {
	latestVersionById: Map<string, number>;
	plan: VersionedPlanIdentity;
}) =>
	plan.version !== undefined &&
	plan.version < (latestVersionById.get(plan.id) ?? plan.version);

export const planChangeHasHistoricalVersions = ({
	planChange,
}: {
	planChange: CatalogPreviewUpdateResponse["plan_changes"][number];
}) => {
	if ((planChange.other_versions?.length ?? 0) > 0) return true;

	const latestVariantVersionById = new Map<string, number>();
	for (const variant of planChange.variants ?? []) {
		latestVariantVersionById.set(
			variant.plan_id,
			Math.max(
				latestVariantVersionById.get(variant.plan_id) ?? 0,
				variant.version,
			),
		);
	}

	return (planChange.variants ?? []).some(
		(variant) =>
			variant.version <
			(latestVariantVersionById.get(variant.plan_id) ?? variant.version),
	);
};

// Check if a feature can be deleted
export async function checkFeatureDeleteInfo(
	featureId: string,
	localFeatures: Feature[],
	remoteFeatures: Feature[],
): Promise<FeatureDeleteInfo> {
	const secretKey = getSecretKey();

	// Get the feature type from remote for sorting purposes
	const remoteFeature = remoteFeatures.find((f) => f.id === featureId);
	const featureType = remoteFeature?.type as
		| "boolean"
		| "metered"
		| "credit_system"
		| undefined;

	// Check locally if this feature is referenced by any credit system in the config
	const referencingCreditSystems = localFeatures.filter(
		(f) =>
			f.type === "credit_system" &&
			f.creditSchema?.some((cs) => cs.meteredFeatureId === featureId),
	);

	if (referencingCreditSystems.length >= 1) {
		return {
			id: featureId,
			canDelete: false,
			reason: "credit_system",
			referencingCreditSystems: referencingCreditSystems.map((f) => f.id),
			featureType,
		};
	}

	// Check API for product references
	const response = await getFeatureDeletionInfo({ secretKey, featureId });

	if (response && response.totalCount > 0) {
		return {
			id: featureId,
			canDelete: false,
			reason: "products",
			referencingProducts: {
				name: response.productName || "Unknown Product",
				count: response.totalCount,
			},
			featureType,
		};
	}

	return {
		id: featureId,
		canDelete: true,
		featureType,
	};
}

// Check if a plan can be deleted
async function checkPlanDeleteInfo(planId: string): Promise<PlanDeleteInfo> {
	const secretKey = getSecretKey();
	const response = await getPlanDeletionInfo({ secretKey, planId });

	if (response && response.totalCount > 0) {
		return {
			id: planId,
			canDelete: false,
			customerCount: response.totalCount,
			firstCustomerName: response.customerName,
		};
	}

	return {
		id: planId,
		canDelete: true,
		customerCount: 0,
	};
}

// Check if updating a plan will create a new version
async function checkPlanForVersioning(
	plan: Plan,
	remotePlans: Plan[],
	localFeatureIds: Set<string>,
	remoteFeatureIds: Set<string>,
): Promise<PlanUpdateInfo> {
	const secretKey = getSecretKey();
	const remotePlan = remotePlans.find((p) => p.id === plan.id);
	const remotePlanArchived = Boolean(remotePlan?.archived);

	if (!remotePlan) {
		return {
			plan,
			willVersion: false,
			isArchived: false,
		};
	}

	const missingFeatureIds = (plan.items || [])
		.map((item) => item.featureId)
		.filter((featureId) => !remoteFeatureIds.has(featureId));

	const missingLocalFeatureIds = missingFeatureIds.filter((featureId) =>
		localFeatureIds.has(featureId),
	);
	const missingUnknownFeatureIds = missingFeatureIds.filter(
		(featureId) => !localFeatureIds.has(featureId),
	);

	if (missingLocalFeatureIds.length > 0) {
		// if (missingUnknownFeatureIds.length > 0) {
		// 	console.log(
		// 		`[checkPlanForVersioning] plan=${plan.id} has mixed missing features. Local-first features: ${missingLocalFeatureIds.join(", ")}; missing unknown: ${missingUnknownFeatureIds.join(", ")}.`,
		// 	);
		// } else {
		// 	console.log(
		// 		`[checkPlanForVersioning] plan=${plan.id} has local-only feature refs (${missingLocalFeatureIds.join(", ")}). Deferring versioning check until after feature upsert.`,
		// 	);
		// }

		return {
			plan,
			willVersion: false,
			isArchived: remotePlanArchived,
			requiresVersioningRecheck: true,
		};
	}

	try {
		// Transform SDK plan to API format for comparison
		const apiPlan = transformPlanToApi(plan);
		const response = await getPlanHasCustomers({
			secretKey,
			planId: plan.id,
			plan: apiPlan,
		});

		return {
			plan,
			willVersion: response.will_version || false,
			isArchived: response.archived || false,
		};
	} catch (error: unknown) {
		const apiError = error as { response?: { code?: string } };
		const response = apiError.response as
			| { message?: string; feature?: string; feature_id?: string }
			| undefined;
		const responseMessage =
			(response && (response.message as string | undefined)) || "";

		const missingFeatureMatch =
			/Feature\s+["']?([a-zA-Z0-9_-]+)["']?\s+not\s+found/i.exec(
				responseMessage,
			);
		const missingFeature =
			response?.feature || response?.feature_id || missingFeatureMatch?.[1];

		// If the plan references a feature that hasn't been created yet,
		// defer versioning validation until after the feature upsert step.
		if (
			apiError.response?.code === "feature_not_found" ||
			/Feature\s+["']?([a-zA-Z0-9_-]+)["']?\s+not\s+found/i.test(
				responseMessage,
			)
		) {
			// if (missingUnknownFeatureIds.length > 0) {
			// 	console.log(
			// 		`[checkPlanForVersioning] plan=${plan.id} failed versioning check: feature "${missingFeature || "unknown"}" not found and not in local config`,
			// 	);
			// } else if (missingFeature) {
			// 	console.log(
			// 		`[checkPlanForVersioning] plan=${plan.id} deferring versioning check due feature_not_found for feature "${missingFeature}", will recheck after feature upsert`,
			// 	);
			// } else {
			// 	console.log(
			// 		`[checkPlanForVersioning] plan=${plan.id} deferring versioning check due feature_not_found`,
			// 	);
			// }

			return {
				plan,
				willVersion: false,
				isArchived: remotePlanArchived,
				requiresVersioningRecheck: missingLocalFeatureIds.length > 0,
			};
		}

		throw error;
	}
}

/**
 * Re-check plan versioning after feature-level writes have run.
 * This allows the normal API-side versioning check to run when missing
 * features were only missing during analysis and are expected to be created
 * in the same push.
 */
export async function refreshPlansForVersioning(
	planUpdates: PlanUpdateInfo[],
	localFeatures: Feature[],
	forceRecheck = false,
): Promise<PlanUpdateInfo[]> {
	const needsRecheck = planUpdates.some(
		(plan) => forceRecheck || plan.requiresVersioningRecheck,
	);

	if (!needsRecheck) {
		return planUpdates;
	}

	const localFeatureIds = new Set(localFeatures.map((f) => f.id));
	const remoteData = await fetchRemoteData();
	const remoteFeatureIds = new Set(remoteData.features.map((f) => f.id));

	return Promise.all(
		planUpdates.map((planUpdate) => {
			if (!forceRecheck && !planUpdate.requiresVersioningRecheck) {
				return Promise.resolve(planUpdate);
			}

			return checkPlanForVersioning(
				planUpdate.plan,
				remoteData.plans,
				localFeatureIds,
				remoteFeatureIds,
			);
		}),
	);
}

/**
 * Deep equality check that treats null and undefined as equivalent.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, i) => valuesEqual(item, b[i]));
	}

	if (typeof a === "object" && typeof b === "object") {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
		for (const key of allKeys) {
			if (!valuesEqual(aObj[key], bObj[key])) return false;
		}
		return true;
	}

	return false;
}

/**
 * Normalize a feature to a canonical form for comparison.
 * Strips default/empty values so semantically identical features
 * produce the same representation.
 */
function normalizeFeatureForCompare(f: Feature): Record<string, unknown> {
	const result: Record<string, unknown> = {
		id: f.id,
		name: f.name,
		type: f.type,
	};

	// consumable is only meaningful for metered features.
	// For credit_system it's always true (the only valid value), so omit it.
	if (f.type === "metered" && "consumable" in f) {
		result.consumable = (f as { consumable: boolean }).consumable;
	}

	if (f.eventNames && f.eventNames.length > 0) {
		result.eventNames = [...f.eventNames].sort();
	}

	if (f.creditSchema && f.creditSchema.length > 0) {
		result.creditSchema = [...f.creditSchema]
			.sort((a, b) => a.meteredFeatureId.localeCompare(b.meteredFeatureId))
			.map((cs) => ({
				meteredFeatureId: cs.meteredFeatureId,
				creditCost: cs.creditCost,
			}));
	}

	if (f.type === "ai_credit_system") {
		const ai = f as Extract<Feature, { type: "ai_credit_system" }>;
		if (ai.modelMarkups && Object.keys(ai.modelMarkups).length > 0) {
			result.modelMarkups = Object.fromEntries(
				Object.entries(ai.modelMarkups)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([modelId, entry]) => [
						modelId,
						{
							markup: entry.markup,
							inputCost: entry.inputCost,
							outputCost: entry.outputCost,
						},
					]),
			);
		}
		if (ai.defaultMarkup != null) result.defaultMarkup = ai.defaultMarkup;
		if (ai.providerMarkups && Object.keys(ai.providerMarkups).length > 0) {
			result.providerMarkups = Object.fromEntries(
				Object.entries(ai.providerMarkups).sort(([a], [b]) =>
					a.localeCompare(b),
				),
			);
		}
	}

	return result;
}

/**
 * Normalize a plan item to a canonical form for comparison.
 * Strips default values (unlimited: false, billingUnits: 1, intervalCount: 1).
 */
function normalizePlanFeatureForCompare(pf: PlanItem): Record<string, unknown> {
	const f = pf as Record<string, unknown>;
	const result: Record<string, unknown> = {
		featureId: pf.featureId,
	};

	if (f.included != null && f.included !== 0) result.included = f.included;
	if (f.unlimited === true) result.unlimited = true;

	const reset = f.reset as Record<string, unknown> | undefined;
	if (reset != null) {
		const r: Record<string, unknown> = { interval: reset.interval };
		if (reset.intervalCount != null && reset.intervalCount !== 1) {
			r.intervalCount = reset.intervalCount;
		}
		result.reset = r;
	}

	const price = f.price as Record<string, unknown> | undefined;
	if (price != null) {
		const p: Record<string, unknown> = {};
		if (price.amount != null) p.amount = price.amount;
		if (price.billingMethod != null) p.billingMethod = price.billingMethod;
		if (price.interval != null) p.interval = price.interval;
		if (price.intervalCount != null && price.intervalCount !== 1) {
			p.intervalCount = price.intervalCount;
		}
		if (
			price.tiers != null &&
			Array.isArray(price.tiers) &&
			price.tiers.length > 0
		) {
			p.tiers = price.tiers;
		}
		if (price.billingUnits != null && price.billingUnits !== 1) {
			p.billingUnits = price.billingUnits;
		}
		if (price.maxPurchase != null) p.maxPurchase = price.maxPurchase;
		if (Object.keys(p).length > 0) result.price = p;
	}

	const proration = f.proration as Record<string, unknown> | undefined;
	if (proration != null) result.proration = proration;

	const rollover = f.rollover as Record<string, unknown> | undefined;
	if (rollover != null) result.rollover = rollover;

	return result;
}

function getPlanFeatureIds(plan: Plan): string[] {
	return (plan.items || []).map((item) => item.featureId);
}

/**
 * Normalize a plan to a canonical form for comparison.
 * Strips default/empty values so semantically identical plans
 * produce the same representation.
 */
function normalizePlanForCompare(plan: Plan): Record<string, unknown> {
	const result: Record<string, unknown> = {
		id: plan.id,
		name: plan.name,
	};

	if (plan.description != null && plan.description !== "") {
		result.description = plan.description;
	}
	if (plan.group != null && plan.group !== "") {
		result.group = plan.group;
	}
	if (plan.addOn === true) result.addOn = true;
	if (plan.autoEnable === true) result.autoEnable = true;

	if (plan.price != null) {
		result.price = {
			amount: plan.price.amount,
			interval: plan.price.interval,
		};
	}

	if (plan.freeTrial != null) {
		result.freeTrial = {
			durationLength: plan.freeTrial.durationLength,
			durationType: plan.freeTrial.durationType,
			cardRequired: plan.freeTrial.cardRequired,
		};
	}

	if (plan.billingControls != null) {
		result.billingControls = plan.billingControls;
	}

	if (plan.items != null && plan.items.length > 0) {
		result.items = [...plan.items]
			.sort((a, b) => a.featureId.localeCompare(b.featureId))
			.map(normalizePlanFeatureForCompare);
	}

	return result;
}

/**
 * Check if a local feature differs from its remote counterpart.
 * Transforms the remote API data to SDK format before comparing.
 */
function hasFeatureChanged(local: Feature, remoteRaw: unknown): boolean {
	return !valuesEqual(
		normalizeFeatureForCompare(local),
		normalizeFeatureForCompare(remoteRaw as Feature),
	);
}

/**
 * Check if a local plan differs from its remote counterpart.
 * Transforms the remote API data to SDK format before comparing.
 */
function hasPlanChanged(local: Plan, remoteRaw: unknown): boolean {
	return !valuesEqual(
		normalizePlanForCompare(local),
		normalizePlanForCompare(remoteRaw as Plan),
	);
}

function planContainsFeature(plan: Plan, featureId: string): boolean {
	return getPlanFeatureIds(plan).some((id) => id === featureId);
}

function toCatalogFeatureParams(feature: Feature): Record<string, unknown> {
	const apiFeature = transformFeatureToApi(feature) as Record<string, unknown>;
	const { id, archived, ...rest } = apiFeature;

	return {
		feature_id: id,
		...rest,
	};
}

function toApiPlanItemFilter(filter: PlanItemFilter): Record<string, unknown> {
	return {
		...(filter.featureId !== undefined ? { feature_id: filter.featureId } : {}),
		...(filter.billingMethod !== undefined
			? { billing_method: filter.billingMethod }
			: {}),
		...(filter.interval !== undefined ? { interval: filter.interval } : {}),
		...(filter.intervalCount !== undefined
			? { interval_count: filter.intervalCount }
			: {}),
	};
}

function toApiCustomizePlan(customize: CustomizePlan): Record<string, unknown> {
	return {
		...(customize.price !== undefined
			? {
					price: customize.price
						? {
								amount: customize.price.amount,
								interval: customize.price.interval,
								...(customize.price.intervalCount !== undefined
									? { interval_count: customize.price.intervalCount }
									: {}),
							}
						: null,
				}
			: {}),
		...(customize.items !== undefined
			? { items: customize.items.map(transformPlanItem) }
			: {}),
		...(customize.addItems !== undefined
			? { add_items: customize.addItems.map(transformPlanItem) }
			: {}),
		...(customize.removeItems !== undefined
			? { remove_items: customize.removeItems.map(toApiPlanItemFilter) }
			: {}),
		...(customize.freeTrial !== undefined
			? {
					free_trial: customize.freeTrial
						? {
								duration_type: customize.freeTrial.durationType,
								duration_length: customize.freeTrial.durationLength,
								card_required: customize.freeTrial.cardRequired,
							}
						: null,
				}
			: {}),
	};
}

function toCatalogVariantParams(
	variant: Variant,
	intent?: VariantUpdateIntentSelections[string],
	createMigration = false,
): Record<string, unknown> {
	return {
		variant_plan_id: variant.id,
		name: variant.name,
		customize: toApiCustomizePlan(variant.customize ?? {}),
		...(intent === "create_version" ? { force_version: true } : {}),
		...(intent === "update_current" ? { disable_version: true } : {}),
		...(createMigration && intent === "update_current"
			? { migration: { draft: true } }
			: {}),
	};
}

function toCatalogPlanParams(
	plan: Plan,
	variants?: VariantPropagationSelections[string],
	intent?: PlanUpdateIntentSelections[string],
	createMigration = false,
	latestVersionById: Map<string, number> = new Map(),
	includePreviewDetails = false,
	variantUpdateIntentSelections: VariantUpdateIntentSelections = {},
	variantMigrationSelections: VariantMigrationSelections = {},
	skippedPlanIds: Set<string> = new Set(),
): Record<string, unknown> {
	const apiPlan = transformPlanToApi(plan) as Record<string, unknown>;
	const { description, id, ...rest } = apiPlan;
	const historical = isHistoricalPlan({ latestVersionById, plan });
	const updateCurrent = historical || intent === "update_current";
	const updateAllVersions = intent === "update_all_versions";
	const shouldCreateMigration =
		createMigration && (updateCurrent || updateAllVersions);
	const configuredVariants = (plan.variants ?? [])
		.filter((variant) => !skippedPlanIds.has(variant.id))
		.map((variant) =>
			toCatalogVariantParams(
				variant,
				variantUpdateIntentSelections[variant.id],
				variantMigrationSelections[variant.id] ?? false,
			),
		);
	const configuredVariantsById = new Map(
		configuredVariants.map((variant) => [variant.variant_plan_id, variant]),
	);
	const selectedPropagationVariants =
		variants
			?.filter((variant) => !skippedPlanIds.has(variant.variant_plan_id))
			.map(
				(variant) =>
					configuredVariantsById.get(variant.variant_plan_id) ?? variant,
			) ?? [];
	const directVariantUpdates = configuredVariants.filter((variant) => {
		const variantId = variant.variant_plan_id as string;
		return (
			variantUpdateIntentSelections[variantId] !== undefined ||
			variantMigrationSelections[variantId] !== undefined
		);
	});
	const variantUpdates =
		variants === undefined
			? configuredVariants
			: [
					...new Map(
						[...selectedPropagationVariants, ...directVariantUpdates].map(
							(variant) => [variant.variant_plan_id, variant],
						),
					).values(),
				];

	return {
		plan_id: id,
		...(plan.version !== undefined ? { version: plan.version } : {}),
		...rest,
		...(variantUpdates.length > 0 ? { variants: variantUpdates } : {}),
		...(includePreviewDetails
			? { include_versions: true, include_variants: true }
			: {}),
		...(updateCurrent ? { disable_version: true } : {}),
		...(updateAllVersions ? { all_versions: true } : {}),
		...(shouldCreateMigration ? { migration: { draft: true } } : {}),
		...(description != null ? { description } : {}),
		group: apiPlan.group ?? "",
		add_on: apiPlan.add_on ?? false,
		auto_enable: apiPlan.auto_enable ?? false,
		price: apiPlan.price ?? null,
		items: apiPlan.items ?? [],
		free_trial: apiPlan.free_trial ?? null,
	};
}

function collectVariantPlanIds(plans: Plan[]): string[] {
	return plans.flatMap((plan) => {
		const variants = (plan as { variants?: { id: string }[] }).variants;
		return variants?.map((variant) => variant.id) ?? [];
	});
}

function collectSkippedPropagationVariantIds({
	plans,
	preview,
	variantPropagationSelections,
}: {
	plans: Plan[];
	preview: CatalogPreviewUpdateResponse;
	variantPropagationSelections: VariantPropagationSelections;
}) {
	const skipped = new Set<string>();
	const plansByTargetKey = new Map(
		plans.map((plan) => [planTargetKey(plan), plan] as const),
	);
	const plansById = new Map(plans.map((plan) => [plan.id, plan] as const));

	for (const planChange of preview.plan_changes) {
		const selectionKey =
			planChange.version !== undefined
				? planTargetKey({ id: planChange.plan_id, version: planChange.version })
				: planChange.plan_id;
		if (
			!(selectionKey in variantPropagationSelections) &&
			!(planChange.plan_id in variantPropagationSelections)
		) {
			continue;
		}

		const selectedIds = new Set(
			(
				variantPropagationSelections[selectionKey] ??
				variantPropagationSelections[planChange.plan_id] ??
				[]
			).map((variant) => variant.variant_plan_id),
		);

		const localPlan =
			plansByTargetKey.get(selectionKey) ?? plansById.get(planChange.plan_id);
		for (const variant of localPlan?.variants ?? []) {
			if (!selectedIds.has(variant.id)) skipped.add(variant.id);
		}

		for (const variant of getVariantPropagationPreviews({ planChange })) {
			const variantPlanId = (variant as { plan_id?: string }).plan_id;
			if (variantPlanId && !selectedIds.has(variantPlanId)) {
				skipped.add(variantPlanId);
			}
		}
	}

	return skipped;
}

async function syncSkippedPropagationVariantsToConfig({
	cwd,
	features,
	plans,
	preview,
	secretKey,
	variantPropagationSelections,
}: {
	cwd: string;
	features: Feature[];
	plans: Plan[];
	preview: CatalogPreviewUpdateResponse;
	secretKey: string;
	variantPropagationSelections: VariantPropagationSelections;
}) {
	const skippedVariantIds = collectSkippedPropagationVariantIds({
		plans,
		preview,
		variantPropagationSelections,
	});
	if (skippedVariantIds.size === 0) return;

	const remotePlans = transformApiPlans(
		await fetchPlans({ secretKey, includeArchived: true }),
	);
	const remoteVariantsById = new Map(
		remotePlans.flatMap((plan) =>
			(plan.variants ?? []).map((variant) => [variant.id, variant] as const),
		),
	);
	let changed = false;
	const nextPlans = plans.map((plan) => {
		if (!plan.variants?.length) return plan;
		let planChanged = false;

		const nextVariants = plan.variants.map((variant) => {
			if (!skippedVariantIds.has(variant.id)) return variant;
			const remoteVariant = remoteVariantsById.get(variant.id);
			if (!remoteVariant) return variant;
			changed = true;
			planChanged = true;
			return remoteVariant;
		});

		return planChanged ? { ...plan, variants: nextVariants } : plan;
	});

	if (changed) {
		await writeConfig(features, nextPlans, cwd);
	}
}

export function buildCatalogUpdateParams({
	features,
	plans,
	skipFeatureIds = [],
	skipPlanIds = [],
	planUpdateIntentSelections = {},
	planMigrationSelections = {},
	variantPropagationSelections = {},
	variantUpdateIntentSelections = {},
	variantMigrationSelections = {},
	includePreviewDetails = false,
}: {
	features: Feature[];
	plans: Plan[];
	skipFeatureIds?: string[];
	skipPlanIds?: string[];
	planUpdateIntentSelections?: PlanUpdateIntentSelections;
	planMigrationSelections?: PlanMigrationSelections;
	variantPropagationSelections?: VariantPropagationSelections;
	variantUpdateIntentSelections?: VariantUpdateIntentSelections;
	variantMigrationSelections?: VariantMigrationSelections;
	includePreviewDetails?: boolean;
}): CatalogUpdateParams {
	const sortedFeatures = [...features].sort((a, b) => {
		if (a.type === "credit_system" && b.type !== "credit_system") return 1;
		if (a.type !== "credit_system" && b.type === "credit_system") return -1;
		return 0;
	});
	const latestVersionById = buildLatestPlanVersionById(plans);
	const skippedPlanIdSet = new Set(skipPlanIds);

	return {
		features: sortedFeatures.map(toCatalogFeatureParams),
		plans: plans.map((plan) =>
			toCatalogPlanParams(
				plan,
				variantPropagationSelections[planTargetKey(plan)] ??
					variantPropagationSelections[plan.id],
				planUpdateIntentSelections[planTargetKey(plan)] ??
					planUpdateIntentSelections[plan.id],
				planMigrationSelections[planTargetKey(plan)] ??
					planMigrationSelections[plan.id] ??
					false,
				latestVersionById,
				includePreviewDetails,
				variantUpdateIntentSelections,
				variantMigrationSelections,
				skippedPlanIdSet,
			),
		),
		skip_deletions: false,
		skip_feature_ids: skipFeatureIds,
		skip_plan_ids: [
			...new Set([...skipPlanIds, ...collectVariantPlanIds(plans)]),
		],
	};
}

export const catalogFeatureChangeHasChanges = (
	change: CatalogPreviewUpdateResponse["feature_changes"][number],
): boolean => change.action !== "none";

const catalogPlanVariantHasChanges = (
	variant: CatalogPreviewUpdateResponse["plan_changes"][number]["variants"][number],
): boolean => Boolean(variant.update_source);

export const catalogPlanChangeHasChanges = (
	change: CatalogPreviewUpdateResponse["plan_changes"][number],
): boolean =>
	change.action !== "none" ||
	change.variants.some(catalogPlanVariantHasChanges);

export const catalogPreviewHasChanges = (
	preview: CatalogPreviewUpdateResponse,
): boolean =>
	preview.feature_changes.some(catalogFeatureChangeHasChanges) ||
	preview.plan_changes.some(catalogPlanChangeHasChanges);

export function catalogPreviewToPushResult(
	preview: CatalogPreviewUpdateResponse,
): PushResult {
	const result: PushResult = {
		featuresCreated: [],
		featuresUpdated: [],
		featuresDeleted: [],
		featuresArchived: [],
		featuresSkipped: [],
		plansCreated: [],
		plansUpdated: [],
		plansVersioned: [],
		plansDeleted: [],
		plansArchived: [],
		plansSkipped: [],
	};

	for (const change of preview.feature_changes) {
		if (change.blocked) {
			result.featuresSkipped.push(change.feature_id);
			continue;
		}

		if (!catalogFeatureChangeHasChanges(change)) {
			continue;
		}

		if (change.action === "create") {
			result.featuresCreated.push(change.feature_id);
		} else if (change.action === "update") {
			result.featuresUpdated.push(change.feature_id);
		} else if (change.action === "remove") {
			if (change.will_archive) {
				result.featuresArchived.push(change.feature_id);
			} else {
				result.featuresDeleted.push(change.feature_id);
			}
		} else if (change.action === "skipped") {
			result.featuresSkipped.push(change.feature_id);
		}
	}

	for (const change of preview.plan_changes) {
		if (!catalogPlanChangeHasChanges(change)) {
			continue;
		}

		if (change.action === "created") {
			result.plansCreated.push(change.plan_id);
		} else if (change.action === "updated") {
			if (change.versionable) {
				result.plansVersioned.push(change.plan_id);
			} else {
				result.plansUpdated.push(change.plan_id);
			}
		} else if (change.action === "deleted") {
			if (change.will_archive) {
				result.plansArchived.push(change.plan_id);
			} else {
				result.plansDeleted.push(change.plan_id);
			}
		} else if (change.action === "skipped") {
			result.plansSkipped.push(change.plan_id);
		}

		for (const variant of getDirectVariantUpdatePreviews({
			planChange: change,
		})) {
			if (variant.versionable) {
				result.plansVersioned.push(variant.plan_id);
			} else {
				result.plansUpdated.push(variant.plan_id);
			}
		}
	}

	return result;
}

export async function previewCatalogPush({
	features,
	plans,
	skipFeatureIds,
	skipPlanIds,
	planUpdateIntentSelections,
	planMigrationSelections,
	variantPropagationSelections,
	variantUpdateIntentSelections,
	variantMigrationSelections,
}: {
	features: Feature[];
	plans: Plan[];
	skipFeatureIds?: string[];
	skipPlanIds?: string[];
	planUpdateIntentSelections?: PlanUpdateIntentSelections;
	planMigrationSelections?: PlanMigrationSelections;
	variantPropagationSelections?: VariantPropagationSelections;
	variantUpdateIntentSelections?: VariantUpdateIntentSelections;
	variantMigrationSelections?: VariantMigrationSelections;
}): Promise<{
	params: CatalogUpdateParams;
	preview: CatalogPreviewUpdateResponse;
}> {
	const secretKey = getSecretKey();
	const params = buildCatalogUpdateParams({
		features,
		plans,
		skipFeatureIds,
		skipPlanIds,
		planUpdateIntentSelections,
		planMigrationSelections,
		variantPropagationSelections,
		variantUpdateIntentSelections,
		variantMigrationSelections,
		includePreviewDetails: true,
	});
	const preview = await previewUpdateCatalog({ secretKey, params });

	return { params, preview };
}

export async function pushCatalog({
	features,
	migratePlanIds,
	migrateVersioned = false,
	plans,
	preview,
	skipFeatureIds,
	skipPlanIds,
	planUpdateIntentSelections,
	planMigrationSelections,
	variantPropagationSelections,
	variantUpdateIntentSelections,
	variantMigrationSelections,
	cwd,
}: {
	features: Feature[];
	migratePlanIds?: string[];
	migrateVersioned?: boolean;
	plans: Plan[];
	preview?: CatalogPreviewUpdateResponse;
	skipFeatureIds?: string[];
	skipPlanIds?: string[];
	planUpdateIntentSelections?: PlanUpdateIntentSelections;
	planMigrationSelections?: PlanMigrationSelections;
	variantPropagationSelections?: VariantPropagationSelections;
	variantUpdateIntentSelections?: VariantUpdateIntentSelections;
	variantMigrationSelections?: VariantMigrationSelections;
	cwd?: string;
}): Promise<PushResult> {
	const secretKey = getSecretKey();
	const params = buildCatalogUpdateParams({
		features,
		plans,
		skipFeatureIds,
		skipPlanIds,
		planUpdateIntentSelections,
		planMigrationSelections,
		variantPropagationSelections,
		variantUpdateIntentSelections,
		variantMigrationSelections,
	});
	const resolvedPreview =
		preview ?? (await previewUpdateCatalog({ secretKey, params }));

	await updateCatalog({ secretKey, params });
	const result = catalogPreviewToPushResult(resolvedPreview);

	if (cwd && variantPropagationSelections) {
		await syncSkippedPropagationVariantsToConfig({
			cwd,
			features,
			plans,
			preview: resolvedPreview,
			secretKey,
			variantPropagationSelections,
		});
	}

	const plansToMigrate =
		migratePlanIds ?? (migrateVersioned ? result.plansVersioned : []);
	if (plansToMigrate.length > 0) {
		const updatedPlans = await fetchPlans({
			secretKey,
			includeArchived: false,
		});

		for (const planId of plansToMigrate) {
			const updatedPlan = updatedPlans.find((plan) => plan.id === planId);
			if (updatedPlan && updatedPlan.version > 1) {
				await migrateProduct({
					secretKey,
					fromProductId: planId,
					fromVersion: updatedPlan.version - 1,
					toProductId: planId,
					toVersion: updatedPlan.version,
				});
			}
		}
	}

	return result;
}

/**
 * Analyze what changes need to be pushed
 */
export async function analyzePush(
	localFeatures: Feature[],
	localPlans: Plan[],
): Promise<PushAnalysis> {
	const remoteData = await fetchRemoteData();

	const localFeatureIds = new Set(localFeatures.map((f) => f.id));
	const localPlanIds = new Set(localPlans.map((p) => p.id));
	const remoteFeaturesById = new Map(remoteData.features.map((f) => [f.id, f]));
	const remotePlansById = new Map(remoteData.plans.map((p) => [p.id, p]));
	const localPlansById = new Map(localPlans.map((p) => [p.id, p]));

	// Find features to create and update (only actually changed features)
	const featuresToCreate = localFeatures.filter(
		(f) => !remoteFeaturesById.has(f.id),
	);
	const featuresToUpdate = localFeatures.filter((f) => {
		const remoteFeature = remoteFeaturesById.get(f.id);
		if (!remoteFeature) return false;
		return hasFeatureChanged(f, remoteFeature);
	});

	// Find archived features in local config that need unarchiving
	// Only include if: remote is archived AND local does NOT have archived: true
	const archivedFeatures = localFeatures.filter((f) => {
		const remote = remoteFeaturesById.get(f.id);
		const localArchived = f.archived;
		const remoteArchived = remote?.archived;
		// Prompt to unarchive only if remote is archived but local doesn't explicitly want it archived
		return remoteArchived && !localArchived;
	});

	// Find plans to create and update (only actually changed plans)
	const plansToCreate = localPlans.filter((p) => !remotePlansById.has(p.id));
	const plansToUpdateLocal = localPlans.filter((p) => {
		const remotePlan = remotePlansById.get(p.id);
		if (!remotePlan) return false;
		return hasPlanChanged(p, remotePlan);
	});

	// Check versioning info for each plan to update
	const remoteFeatureIds = new Set(remoteData.features.map((f) => f.id));
	const planUpdatePromises = plansToUpdateLocal.map((plan) =>
		checkPlanForVersioning(
			plan,
			remoteData.plans,
			localFeatureIds,
			remoteFeatureIds,
		),
	);
	const plansToUpdate = await Promise.all(planUpdatePromises);

	// Find plans that exist remotely but not locally (potential deletes)
	const planIdsToDelete = [...remotePlansById.values()]
		.filter((p) => !localPlanIds.has(p.id) && !p.archived)
		.map((p) => p.id);

	// Check deletion info for each plan
	const planDeletePromises = planIdsToDelete.map((id) =>
		checkPlanDeleteInfo(id),
	);
	const plansToDelete = await Promise.all(planDeletePromises);

	// Find archived plans in local config that need unarchiving
	// Only include if: remote is archived AND local does NOT have archived: true
	const archivedPlans = localPlans.filter((p) => {
		const remote = remotePlansById.get(p.id);
		const localArchived = p.archived;
		const remoteArchived = remote?.archived;
		// Prompt to unarchive only if remote is archived but local doesn't explicitly want it archived
		return remoteArchived && !localArchived;
	});

	// Build a quick feature->plans reference index from remote plans
	const remoteFeaturePlanRefs = new Map<string, Set<string>>();
	for (const plan of remoteData.plans) {
		for (const featureId of getPlanFeatureIds(plan)) {
			const plansForFeature = remoteFeaturePlanRefs.get(featureId);
			if (plansForFeature) {
				plansForFeature.add(plan.id);
			} else {
				remoteFeaturePlanRefs.set(featureId, new Set([plan.id]));
			}
		}
	}

	const planIdsToDeleteSet = new Set(plansToDelete.map((plan) => plan.id));
	const planDeleteCustomerCount = new Map(
		plansToDelete.map((plan) => [plan.id, plan.customerCount]),
	);
	const plansToUpdateById = new Map(
		plansToUpdate.map((planInfo) => [planInfo.plan.id, planInfo]),
	);
	const plansRemovingFeatureById = new Map<string, Set<string>>();
	for (const remotePlan of remoteData.plans) {
		const localPlan = localPlansById.get(remotePlan.id);
		for (const featureId of getPlanFeatureIds(remotePlan)) {
			const localHasFeature = localPlan
				? planContainsFeature(localPlan, featureId)
				: false;
			if (!localPlan || !localHasFeature) {
				const plansRemovingFeature = plansRemovingFeatureById.get(featureId);
				if (plansRemovingFeature) {
					plansRemovingFeature.add(remotePlan.id);
				} else {
					plansRemovingFeatureById.set(featureId, new Set([remotePlan.id]));
				}
			}
		}
	}

	// Find features that exist remotely but not locally (potential deletes)
	// Exclude already archived features
	const featureIdsToDelete = [...remoteFeaturesById.values()]
		.filter((f) => !localFeatureIds.has(f.id) && !f.archived)
		.map((f) => f.id);

	// Check deletion info for each feature
	const featureDeletePromises = featureIdsToDelete.map((id) =>
		checkFeatureDeleteInfo(id, localFeatures, remoteData.features),
	);
	const rawFeatureDeleteInfos = await Promise.all(featureDeletePromises);

	// Re-evaluate delete blockers for features that are only referenced
	// by plans being changed in this push. If all blockers are removed by
	// current operations and none require versioning, allow deletion.
	const featuresToDeleteUnsorted = rawFeatureDeleteInfos.map((info) => {
		if (info.reason !== "products") {
			return info;
		}

		const remotePlansForFeature =
			remoteFeaturePlanRefs.get(info.id) ?? new Set();
		let hasBlockingPlan = false;

		for (const planId of remotePlansForFeature) {
			const isPlanDeleted = planIdsToDeleteSet.has(planId);
			const isPlanUpdated = plansToUpdateById.has(planId);
			const isPlanRemovingFeature = plansRemovingFeatureById
				.get(info.id)
				?.has(planId);
			const removesReferenceInThisPush =
				isPlanDeleted || (isPlanUpdated && isPlanRemovingFeature);

			if (!removesReferenceInThisPush) {
				hasBlockingPlan = true;
				break;
			}

			if (isPlanDeleted) {
				const customerCount = planDeleteCustomerCount.get(planId) || 0;
				if (customerCount > 0) {
					hasBlockingPlan = true;
					break;
				}
			} else {
				const planInfo = plansToUpdateById.get(planId);
				if (!planInfo || planInfo.willVersion) {
					hasBlockingPlan = true;
					break;
				}
			}
		}

		if (!hasBlockingPlan) {
			return {
				...info,
				canDelete: true,
				reason: undefined,
				referencingProducts: undefined,
			};
		}

		return info;
	});

	// Sort features to delete: credit systems first to prevent dependency issues
	const featuresToDelete = featuresToDeleteUnsorted.sort((a, b) => {
		if (
			a.featureType === "credit_system" &&
			b.featureType !== "credit_system"
		) {
			return -1;
		}
		if (
			a.featureType !== "credit_system" &&
			b.featureType === "credit_system"
		) {
			return 1;
		}
		return 0;
	});

	return {
		featuresToCreate,
		featuresToUpdate,
		featuresToDelete,
		plansToCreate,
		plansToUpdate,
		variantsToUpdate: [],
		plansToDelete,
		archivedFeatures,
		archivedPlans,
	};
}

/**
 * Push a single feature (create or update)
 */
export async function pushFeature(
	feature: Feature,
): Promise<{ action: "created" | "updated" }> {
	const secretKey = getSecretKey();

	const apiFeature = transformFeatureToApi(feature) as Record<string, unknown>;

	try {
		await upsertFeature({
			secretKey,
			feature: apiFeature,
		});
		return { action: "created" };
	} catch (error: unknown) {
		const apiError = error as {
			response?: { code?: string };
		};
		if (
			apiError.response?.code === "duplicate_feature_id" ||
			apiError.response?.code === "product_already_exists"
		) {
			await updateFeature({
				secretKey,
				featureId: feature.id,
				feature: apiFeature,
			});
			return { action: "updated" };
		}
		throw error;
	}
}

/**
 * Push a single plan (create or update)
 */
export async function pushPlan(
	plan: Plan,
	remotePlans: Plan[],
): Promise<{ action: "created" | "updated" | "versioned" }> {
	const secretKey = getSecretKey();
	const remotePlan = remotePlans.find((p) => p.id === plan.id);
	const apiPlan = transformPlanToApi(plan);

	if (!remotePlan) {
		await createPlan({ secretKey, plan: apiPlan });
		return { action: "created" };
	}

	// Prepare update payload with swapNullish/swapFalse logic
	const updatePayload = { ...apiPlan };

	// Handle swapNullish for group field
	if (
		plan.group === undefined &&
		remotePlan.group !== undefined &&
		remotePlan.group !== null
	) {
		updatePayload.group = null;
	} else if (
		plan.group === null &&
		remotePlan.group !== undefined &&
		remotePlan.group !== null
	) {
		updatePayload.group = null;
	}

	// Handle swapFalse for add_on field
	if (plan.addOn === undefined && remotePlan.addOn === true) {
		updatePayload.add_on = false;
	}

	// Handle swapFalse for auto_enable field
	if (plan.autoEnable === undefined && remotePlan.autoEnable === true) {
		updatePayload.auto_enable = false;
	}

	await updatePlan({ secretKey, planId: plan.id, plan: updatePayload });

	// We don't know if it actually versioned here, caller should track based on analysis
	return { action: "updated" };
}

/**
 * Delete a feature
 */
export async function deleteFeature(featureId: string): Promise<void> {
	const secretKey = getSecretKey();
	await deleteFeatureApi({ secretKey, featureId });
}

/**
 * Archive a feature
 */
export async function archiveFeature(featureId: string): Promise<void> {
	const secretKey = getSecretKey();
	await archiveFeatureApi({ secretKey, featureId });
}

/**
 * Un-archive a feature
 */
export async function unarchiveFeature(featureId: string): Promise<void> {
	const secretKey = getSecretKey();
	await unarchiveFeatureApi({ secretKey, featureId });
}

/**
 * Delete a plan
 */
export async function deletePlan(planId: string): Promise<void> {
	const secretKey = getSecretKey();
	await deletePlanApi({ secretKey, planId, allVersions: true });
}

/**
 * Archive a plan
 */
export async function archivePlan(planId: string): Promise<void> {
	const secretKey = getSecretKey();
	await archivePlanApi({ secretKey, planId });
}

/**
 * Un-archive a plan
 */
export async function unarchivePlan(planId: string): Promise<void> {
	const secretKey = getSecretKey();
	await unarchivePlanApi({ secretKey, planId });
}
