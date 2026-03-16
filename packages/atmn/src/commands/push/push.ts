// @ts-nocheck - Using ts-nocheck due to complex Record<string, unknown> index signature issues
import type { Feature, Plan, PlanItem } from "../../compose/models/index.js";
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
	unarchiveFeature as unarchiveFeatureApi,
	unarchivePlan as unarchivePlanApi,
	updateFeature,
	updatePlan,
	upsertFeature,
} from "../../lib/api/endpoints/index.js";
import { isProd } from "../../lib/env/cliContext.js";
import { AppEnv, getKey } from "../../lib/env/index.js";
import {
	transformApiFeature,
	transformApiPlan,
} from "../../lib/transforms/apiToSdk/index.js";
import { transformFeatureToApi, transformPlanToApi } from "../../lib/transforms/sdkToApi/index.js";
import type {
	FeatureDeleteInfo,
	PlanDeleteInfo,
	PlanUpdateInfo,
	PushAnalysis,
	RemoteData,
} from "./types.js";

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
export async function fetchRemoteData(): Promise<RemoteData> {
	const secretKey = getSecretKey();

	const [apiFeatures, apiPlans] = await Promise.all([
		fetchFeatures({ secretKey, includeArchived: true }),
		fetchPlans({ secretKey, includeArchived: true }),
	]);

	return {
		features: apiFeatures.map(transformApiFeature),
		plans: apiPlans.map(transformApiPlan),
	};
}

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

	const missingFeatureIds =
		(plan.items || [])
			.map((item) => item.featureId)
			.filter((featureId) => !remoteFeatureIds.has(featureId));

	const missingLocalFeatureIds = missingFeatureIds.filter((featureId) =>
		localFeatureIds.has(featureId),
	);
	const missingUnknownFeatureIds = missingFeatureIds.filter(
		(featureId) => !localFeatureIds.has(featureId),
	);

	if (missingLocalFeatureIds.length > 0) {
		if (missingUnknownFeatureIds.length > 0) {
			console.log(
				`[checkPlanForVersioning] plan=${plan.id} has mixed missing features. Local-first features: ${missingLocalFeatureIds.join(", ")}; missing unknown: ${missingUnknownFeatureIds.join(", ")}.`,
			);
		} else {
			console.log(
				`[checkPlanForVersioning] plan=${plan.id} has local-only feature refs (${missingLocalFeatureIds.join(", ")}). Deferring versioning check until after feature upsert.`,
			);
		}

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

		const missingFeatureMatch = /Feature\s+["']?([a-zA-Z0-9_-]+)["']?\s+not\s+found/i.exec(
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
			if (missingUnknownFeatureIds.length > 0) {
				console.log(
					`[checkPlanForVersioning] plan=${plan.id} failed versioning check: feature "${missingFeature || "unknown"}" not found and not in local config`,
				);
			} else if (missingFeature) {
				console.log(
					`[checkPlanForVersioning] plan=${plan.id} deferring versioning check due feature_not_found for feature "${missingFeature}", will recheck after feature upsert`,
				);
			} else {
				console.log(
					`[checkPlanForVersioning] plan=${plan.id} deferring versioning check due feature_not_found`,
				);
			}

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
			.sort((a, b) =>
				a.meteredFeatureId.localeCompare(b.meteredFeatureId),
			)
			.map((cs) => ({
				meteredFeatureId: cs.meteredFeatureId,
				creditCost: cs.creditCost,
			}));
	}

	return result;
}

/**
 * Normalize a plan item to a canonical form for comparison.
 * Strips default values (unlimited: false, billingUnits: 1, intervalCount: 1).
 */
function normalizePlanFeatureForCompare(
	pf: PlanItem,
): Record<string, unknown> {
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
		if (price.billingMethod != null)
			p.billingMethod = price.billingMethod;
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
	const remoteFeaturesById = new Map(
		remoteData.features.map((f) => [f.id, f]),
	);
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
		const localArchived = (f as Feature & { archived?: boolean }).archived;
		const remoteArchived = remote && (remote as Feature & { archived?: boolean }).archived;
		// Prompt to unarchive only if remote is archived but local doesn't explicitly want it archived
		return remoteArchived && !localArchived;
	});

	// Find plans to create and update (only actually changed plans)
	const plansToCreate = localPlans.filter(
		(p) => !remotePlansById.has(p.id),
	);
	const plansToUpdateLocal = localPlans.filter((p) => {
		const remotePlan = remotePlansById.get(p.id);
		if (!remotePlan) return false;
		return hasPlanChanged(p, remotePlan);
	});

	// Check versioning info for each plan to update
	const remoteFeatureIds = new Set(remoteData.features.map((f) => f.id));
	const planUpdatePromises = plansToUpdateLocal.map((plan) =>
		checkPlanForVersioning(plan, remoteData.plans, localFeatureIds, remoteFeatureIds),
	);
	const plansToUpdate = await Promise.all(planUpdatePromises);

	// Find plans that exist remotely but not locally (potential deletes)
	const planIdsToDelete = [...remotePlansById.values()]
		.filter(
			(p) =>
				!localPlanIds.has(p.id) &&
				!(p as Plan & { archived?: boolean }).archived,
		)
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
		const localArchived = (p as Plan & { archived?: boolean }).archived;
		const remoteArchived = remote && (remote as Plan & { archived?: boolean }).archived;
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
					plansRemovingFeatureById.set(
						featureId,
						new Set([remotePlan.id]),
					);
				}
			}
		}
	}

	// Find features that exist remotely but not locally (potential deletes)
	// Exclude already archived features
	const featureIdsToDelete = [...remoteFeaturesById.values()]
		.filter(
			(f) =>
				!localFeatureIds.has(f.id) &&
				!(f as Feature & { archived?: boolean }).archived,
		)
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

		const remotePlansForFeature = remoteFeaturePlanRefs.get(info.id) ?? new Set();
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
