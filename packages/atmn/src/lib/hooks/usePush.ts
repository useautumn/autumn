import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { useMutation } from "@tanstack/react-query";
import createJiti from "jiti";
import { useCallback, useEffect, useState } from "react";
import { writeConfig } from "../../commands/pull/writeConfig.js";
import {
	analyzePush,
	archiveFeature as archiveFeatureApi,
	archivePlan as archivePlanApi,
	checkFeatureDeleteInfo,
	createFeatureArchivedPrompt,
	createFeatureDeletePrompt,
	createPlanArchivedPrompt,
	createPlanDeletePrompt,
	createPlanVersioningPrompt,
	createProdConfirmationPrompt,
	deleteFeature as deleteFeatureApi,
	deletePlan as deletePlanApi,
	type FeatureDeleteInfo,
	fetchRemoteData,
	type PushAnalysis,
	type PushPrompt,
	type PushResult,
	pushFeature,
	pushPlan,
	refreshPlansForVersioning,
	unarchiveFeature as unarchiveFeatureApi,
	unarchivePlan as unarchivePlanApi,
} from "../../commands/push/index.js";
import type { Feature, Plan } from "../../compose/models/index.js";
import { formatError } from "../api/client.js";
import { fetchPlans, migrateProduct } from "../api/endpoints/index.js";
import { AppEnv, getKey, resolveConfigPath } from "../env/index.js";
import { type OrganizationInfo, useOrganization } from "./useOrganization.js";

export type PushPhase =
	| "loading_config"
	| "loading_org"
	| "analyzing"
	| "no_changes"
	| "confirming"
	| "pushing_features"
	| "pushing_plans"
	| "deleting"
	| "complete"
	| "error";

export type FeatureStatus =
	| "pending"
	| "pushing"
	| "created"
	| "updated"
	| "deleted"
	| "archived"
	| "skipped";

export type PlanStatus =
	| "pending"
	| "pushing"
	| "created"
	| "updated"
	| "versioned"
	| "deleted"
	| "archived"
	| "skipped";

export interface UsePushOptions {
	cwd?: string;
	environment?: AppEnv;
	yes?: boolean;
	onComplete?: () => void;
}

interface LocalConfig {
	features: Feature[];
	plans: Plan[];
}

// Load local config file
async function loadLocalConfig(cwd: string): Promise<LocalConfig> {
	const configPath = resolveConfigPath(cwd);

	if (!fs.existsSync(configPath)) {
		throw new Error(
			`Config file not found at ${configPath}. Run 'atmn pull' first.`,
		);
	}

	const absolutePath = resolve(configPath);
	const fileUrl = pathToFileURL(absolutePath).href;

	const jiti = createJiti(import.meta.url);
	const mod = await jiti.import(fileUrl);

	const plans: Plan[] = [];
	const features: Feature[] = [];

	// Check for old-style default export first
	const modRecord = mod as { default?: unknown } & Record<string, unknown>;
	const defaultExport = modRecord.default as
		| {
				plans?: Plan[];
				features?: Feature[];
				products?: Plan[];
		  }
		| undefined;

	if (defaultExport?.plans && defaultExport?.features) {
		if (Array.isArray(defaultExport.plans)) {
			plans.push(...defaultExport.plans);
		}
		if (Array.isArray(defaultExport.features)) {
			features.push(...defaultExport.features);
		}
	} else if (defaultExport?.products && defaultExport?.features) {
		// Legacy format
		if (Array.isArray(defaultExport.products)) {
			plans.push(...defaultExport.products);
		}
		if (Array.isArray(defaultExport.features)) {
			features.push(...defaultExport.features);
		}
	} else {
		// New format: individual named exports
		for (const [key, value] of Object.entries(modRecord)) {
			if (key === "default") continue;

			const obj = value as { items?: unknown; type?: unknown };
			// Detect if it's a plan (has items array) or feature (has type)
			if (obj && typeof obj === "object") {
				if ("type" in obj) {
					features.push(obj as unknown as Feature);
				} else if (Array.isArray(obj.items) || "id" in obj) {
					plans.push(obj as unknown as Plan);
				}
			}
		}
	}

	return { features, plans };
}

function mergeArchivedFeaturesIntoConfig(
	localFeatures: Feature[],
	remoteFeatures: Feature[],
	archivedFeatureIds: string[],
): { features: Feature[]; hasChanges: boolean } {
	const uniqueIds = [...new Set(archivedFeatureIds)];
	if (uniqueIds.length === 0) {
		return { features: localFeatures, hasChanges: false };
	}

	const remoteFeatureMap = new Map(remoteFeatures.map((f) => [f.id, f]));
	const merged = new Map(localFeatures.map((f) => [f.id, f]));
	let hasChanges = false;

	for (const featureId of uniqueIds) {
		const existingFeature = merged.get(featureId);
		if (existingFeature) {
			if (existingFeature.archived) {
				continue;
			}
			merged.set(featureId, {
				...existingFeature,
				archived: true,
			});
			hasChanges = true;
			continue;
		}

		const remoteFeature = remoteFeatureMap.get(featureId);
		if (!remoteFeature) {
			continue;
		}

		merged.set(featureId, {
			...(remoteFeature as Feature),
			archived: true,
		});
		hasChanges = true;
	}

	if (!hasChanges) {
		return { features: localFeatures, hasChanges: false };
	}

	return { features: Array.from(merged.values()), hasChanges: true };
}

export function usePush(options?: UsePushOptions) {
	const effectiveCwd = options?.cwd ?? process.cwd();
	const environment = options?.environment ?? AppEnv.Sandbox;
	const yes = options?.yes ?? false;
	const onComplete = options?.onComplete;

	const [startTime] = useState(Date.now());
	const [phase, setPhase] = useState<PushPhase>("loading_config");
	const [localConfig, setLocalConfig] = useState<LocalConfig | null>(null);
	const [analysis, setAnalysis] = useState<PushAnalysis | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Prompt queue management
	const [promptQueue, setPromptQueue] = useState<PushPrompt[]>([]);
	const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
	const [promptResponses, setPromptResponses] = useState<Map<string, string>>(
		new Map(),
	);

	// Progress tracking
	const [featureProgress, setFeatureProgress] = useState<
		Map<string, FeatureStatus>
	>(new Map());
	const [planProgress, setPlanProgress] = useState<Map<string, PlanStatus>>(
		new Map(),
	);

	// Results
	const [result, setResult] = useState<PushResult | null>(null);

	// Remote plans for push operations
	const [remotePlans, setRemotePlans] = useState<Plan[]>([]);

	// Get org info
	const orgQuery = useOrganization(effectiveCwd, environment);

	// Current prompt
	const currentPrompt =
		currentPromptIndex < promptQueue.length
			? promptQueue[currentPromptIndex]
			: null;

	// Load local config
	const loadConfigMutation = useMutation({
		mutationFn: async () => {
			const config = await loadLocalConfig(effectiveCwd);

			// Validate config for missing required fields
			const { validateConfig, formatValidationErrors } = await import(
				"../../commands/push/validate.js"
			);
			const validation = validateConfig(config.features, config.plans);
			if (!validation.valid) {
				throw new Error(
					`Config validation failed:\n\n${formatValidationErrors(validation.errors)}`,
				);
			}

			return config;
		},
		onSuccess: (config) => {
			setLocalConfig(config);
			setPhase("loading_org");
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	// Analyze push
	const analyzeMutation = useMutation({
		mutationFn: async (config: LocalConfig) => {
			const remoteData = await fetchRemoteData();
			setRemotePlans(remoteData.plans);
			return await analyzePush(config.features, config.plans);
		},
		onSuccess: (analysisResult) => {
			setAnalysis(analysisResult);

			// Check if there are any meaningful changes to push
			// Check if there are any changes to push
			const hasChanges =
				analysisResult.featuresToCreate.length > 0 ||
				analysisResult.featuresToUpdate.length > 0 ||
				analysisResult.featuresToDelete.length > 0 ||
				analysisResult.plansToCreate.length > 0 ||
				analysisResult.plansToUpdate.length > 0 ||
				analysisResult.plansToDelete.length > 0 ||
				analysisResult.archivedFeatures.length > 0 ||
				analysisResult.archivedPlans.length > 0;

			if (!hasChanges) {
				// No changes to push - show "already in sync" state
				setPhase("no_changes");
				if (onComplete) {
					setTimeout(onComplete, 1000);
				}
				return;
			}

			// Build prompt queue
			const prompts: PushPrompt[] = [];

			// Production confirmation
			if (environment === AppEnv.Live) {
				prompts.push(createProdConfirmationPrompt());
			}

			// Archived features
			for (const feature of analysisResult.archivedFeatures) {
				prompts.push(createFeatureArchivedPrompt(feature));
			}

			// Archived plans
			for (const plan of analysisResult.archivedPlans) {
				prompts.push(createPlanArchivedPrompt(plan));
			}

			// Plans that will version
			for (const planInfo of analysisResult.plansToUpdate) {
				if (planInfo.willVersion) {
					prompts.push(createPlanVersioningPrompt(planInfo, environment));
				}
			}

			// Feature deletions
			for (const info of analysisResult.featuresToDelete) {
				prompts.push(createFeatureDeletePrompt(info));
			}

			// Plan deletions
			for (const info of analysisResult.plansToDelete) {
				prompts.push(createPlanDeletePrompt(info));
			}

			setPromptQueue(prompts);

			// If yes flag or no prompts, proceed directly
			if (yes || prompts.length === 0) {
				// Auto-respond to all prompts with appropriate defaults
				if (yes) {
					const responses = new Map<string, string>();
					for (const prompt of prompts) {
						// Special case: prod confirmation should auto-confirm with --yes
						if (prompt.type === "prod_confirmation") {
							responses.set(prompt.id, "confirm");
							continue;
						}
						// For all other prompts, use the default option
						const defaultOption = prompt.options.find((o) => o.isDefault);
						responses.set(
							prompt.id,
							defaultOption?.value || prompt.options[0]?.value || "confirm",
						);
					}
					setPromptResponses(responses);
				}
				setCurrentPromptIndex(prompts.length);
				setPhase("pushing_features");
			} else {
				setPhase("confirming");
			}
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	// Push features mutation
	const pushFeaturesMutation = useMutation({
		mutationFn: async (config: LocalConfig) => {
			const created: string[] = [];
			const updated: string[] = [];
			const skipped: string[] = [];

			// Check which archived features should be unarchived
			for (const feature of analysis?.archivedFeatures || []) {
				const response = promptResponses.get(
					promptQueue.find(
						(p) => p.type === "feature_archived" && p.entityId === feature.id,
					)?.id || "",
				);
				if (response === "unarchive") {
					setFeatureProgress((prev) =>
						new Map(prev).set(feature.id, "pushing"),
					);
					await unarchiveFeatureApi(feature.id);
				}
			}

			// Push all features — credit_system features must come after their metered dependencies
			const allFeatures = [
				...config.features.filter(
					(f) => !analysis?.archivedFeatures.some((af) => af.id === f.id),
				),
				...config.features.filter((f) =>
					analysis?.archivedFeatures.some((af) => af.id === f.id),
				),
			].sort((a, b) => {
				if (a.type === "credit_system" && b.type !== "credit_system") return 1;
				if (a.type !== "credit_system" && b.type === "credit_system") return -1;
				return 0;
			});

			for (const feature of allFeatures) {
				// Check if this archived feature was skipped
				const isArchived = analysis?.archivedFeatures.some(
					(af) => af.id === feature.id,
				);
				if (isArchived) {
					const response = promptResponses.get(
						promptQueue.find(
							(p) => p.type === "feature_archived" && p.entityId === feature.id,
						)?.id || "",
					);
					if (response === "skip") {
						skipped.push(feature.id);
						setFeatureProgress((prev) =>
							new Map(prev).set(feature.id, "skipped"),
						);
						continue;
					}
				}

				setFeatureProgress((prev) => new Map(prev).set(feature.id, "pushing"));
				const result = await pushFeature(feature);
				if (result.action === "created") {
					created.push(feature.id);
					setFeatureProgress((prev) =>
						new Map(prev).set(feature.id, "created"),
					);
				} else {
					updated.push(feature.id);
					setFeatureProgress((prev) =>
						new Map(prev).set(feature.id, "updated"),
					);
				}
			}

			return { created, updated, skipped };
		},
		onSuccess: () => {
			setPhase("pushing_plans");
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	// Push plans mutation
	const pushPlansMutation = useMutation({
		mutationFn: async (_config: LocalConfig) => {
			const created: string[] = [];
			const updated: string[] = [];
			const versioned: string[] = [];
			const skipped: string[] = [];
			const planUpdates = await refreshPlansForVersioning(
				analysis?.plansToUpdate || [],
				localConfig?.features || [],
			);
			const planUpdateById = new Map(
				planUpdates.map((planInfo) => [planInfo.plan.id, planInfo]),
			);

			// Check which archived plans should be unarchived
			for (const plan of analysis?.archivedPlans || []) {
				const response = promptResponses.get(
					promptQueue.find(
						(p) => p.type === "plan_archived" && p.entityId === plan.id,
					)?.id || "",
				);
				if (response === "unarchive") {
					setPlanProgress((prev) => new Map(prev).set(plan.id, "pushing"));
					await unarchivePlanApi(plan.id);
				}
			}

			// Push plans to create
			for (const plan of analysis?.plansToCreate || []) {
				setPlanProgress((prev) => new Map(prev).set(plan.id, "pushing"));
				await pushPlan(plan, remotePlans);
				created.push(plan.id);
				setPlanProgress((prev) => new Map(prev).set(plan.id, "created"));
			}

			// Push plans to update
			for (const planInfo of analysis?.plansToUpdate || []) {
				const resolvedPlanInfo =
					planUpdateById.get(planInfo.plan.id) || planInfo;
				// Check if this was skipped via prompt
				if (resolvedPlanInfo.willVersion) {
					const response = promptResponses.get(
						promptQueue.find(
							(p) =>
								p.type === "plan_versioning" && p.entityId === planInfo.plan.id,
						)?.id || "",
					);
					if (response === "skip") {
						skipped.push(planInfo.plan.id);
						setPlanProgress((prev) =>
							new Map(prev).set(planInfo.plan.id, "skipped"),
						);
						continue;
					}
				}

				// Check if archived plan was skipped
				if (planInfo.isArchived) {
					const response = promptResponses.get(
						promptQueue.find(
							(p) =>
								p.type === "plan_archived" && p.entityId === planInfo.plan.id,
						)?.id || "",
					);
					if (response === "skip") {
						skipped.push(planInfo.plan.id);
						setPlanProgress((prev) =>
							new Map(prev).set(planInfo.plan.id, "skipped"),
						);
						continue;
					}
				}

				setPlanProgress((prev) =>
					new Map(prev).set(planInfo.plan.id, "pushing"),
				);

				const versioningResponse = resolvedPlanInfo.willVersion
					? promptResponses.get(
							promptQueue.find(
								(p) =>
									p.type === "plan_versioning" &&
									p.entityId === planInfo.plan.id,
							)?.id || "",
						)
					: undefined;

				await pushPlan(planInfo.plan, remotePlans);

				if (
					resolvedPlanInfo.willVersion &&
					versioningResponse === "version_and_migrate"
				) {
					const secretKey = getKey(environment);
					const updatedPlans = await fetchPlans({
						secretKey,
						includeArchived: false,
					});
					const updatedPlan = updatedPlans.find(
						(p) => p.id === planInfo.plan.id,
					);
					if (updatedPlan && updatedPlan.version > 1) {
						await migrateProduct({
							secretKey,
							fromProductId: planInfo.plan.id,
							fromVersion: updatedPlan.version - 1,
							toProductId: planInfo.plan.id,
							toVersion: updatedPlan.version,
						});
					}
				}

				if (resolvedPlanInfo.willVersion) {
					versioned.push(planInfo.plan.id);
					setPlanProgress((prev) =>
						new Map(prev).set(planInfo.plan.id, "versioned"),
					);
				} else {
					updated.push(planInfo.plan.id);
					setPlanProgress((prev) =>
						new Map(prev).set(planInfo.plan.id, "updated"),
					);
				}
			}

			return { created, updated, versioned, skipped };
		},
		onSuccess: () => {
			setPhase("deleting");
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	// Handle deletions mutation
	const deletionsMutation = useMutation({
		mutationFn: async () => {
			const localFeatures = localConfig?.features || [];
			const localPlans = localConfig?.plans || [];
			const featuresDeleted: string[] = [];
			const featuresArchived: string[] = [];
			const featuresSkipped: string[] = [];
			const plansDeleted: string[] = [];
			const plansArchived: string[] = [];
			const plansSkipped: string[] = [];

			const featuresToDelete = analysis?.featuresToDelete || [];
			const plansToDelete = analysis?.plansToDelete || [];
			const refreshedFeatureDeleteInfo = new Map<string, FeatureDeleteInfo>();
			let archivedConfigFeatures = localFeatures;

			// Handle plan deletions based on prompt responses
			for (const info of plansToDelete) {
				const promptId = promptQueue.find(
					(p) => p.type.startsWith("plan_delete") && p.entityId === info.id,
				)?.id;
				const response = promptId ? promptResponses.get(promptId) : undefined;

				// Use response from prompt (auto-set to default in --yes mode)
				const action = response;

				if (action === "delete") {
					setPlanProgress((prev) => new Map(prev).set(info.id, "pushing"));
					await deletePlanApi(info.id);
					plansDeleted.push(info.id);
					setPlanProgress((prev) => new Map(prev).set(info.id, "deleted"));
				} else if (action === "archive") {
					setPlanProgress((prev) => new Map(prev).set(info.id, "pushing"));
					await archivePlanApi(info.id);
					plansArchived.push(info.id);
					setPlanProgress((prev) => new Map(prev).set(info.id, "archived"));
				} else {
					// skip or no response
					plansSkipped.push(info.id);
					setPlanProgress((prev) => new Map(prev).set(info.id, "skipped"));
				}
			}

			let remoteDataForFeatureSync: Feature[] | null = null;
			if (featuresToDelete.length > 0) {
				const remoteData = await fetchRemoteData();
				remoteDataForFeatureSync = remoteData.features;
				const refreshedInfos = await Promise.all(
					featuresToDelete.map((featureInfo) =>
						checkFeatureDeleteInfo(
							featureInfo.id,
							localFeatures,
							remoteData.features,
						),
					),
				);
				for (const info of refreshedInfos) {
					refreshedFeatureDeleteInfo.set(info.id, info);
				}
			}

			// Handle feature deletions based on prompt responses
			for (const info of featuresToDelete) {
				const promptId = promptQueue.find(
					(p) => p.type.startsWith("feature_delete") && p.entityId === info.id,
				)?.id;
				const response = promptId ? promptResponses.get(promptId) : undefined;
				const latestInfo = refreshedFeatureDeleteInfo.get(info.id) ?? info;

				// Use response from prompt (auto-set to default in --yes mode)
				const action = response;

				if (action === "delete") {
					if (!latestInfo.canDelete) {
						featuresSkipped.push(info.id);
						setFeatureProgress((prev) => new Map(prev).set(info.id, "skipped"));
						continue;
					}

					setFeatureProgress((prev) => new Map(prev).set(info.id, "pushing"));
					await deleteFeatureApi(info.id);
					featuresDeleted.push(info.id);
					setFeatureProgress((prev) => new Map(prev).set(info.id, "deleted"));
				} else if (action === "archive") {
					setFeatureProgress((prev) => new Map(prev).set(info.id, "pushing"));
					await archiveFeatureApi(info.id);
					featuresArchived.push(info.id);
					setFeatureProgress((prev) => new Map(prev).set(info.id, "archived"));
				} else {
					// skip or no response
					featuresSkipped.push(info.id);
					setFeatureProgress((prev) => new Map(prev).set(info.id, "skipped"));
				}
			}

			if (featuresArchived.length > 0) {
				if (!remoteDataForFeatureSync) {
					const remoteData = await fetchRemoteData();
					remoteDataForFeatureSync = remoteData.features;
				}

				const { features: mergedFeatures, hasChanges } =
					mergeArchivedFeaturesIntoConfig(
						localFeatures,
						remoteDataForFeatureSync,
						featuresArchived,
					);

				archivedConfigFeatures = mergedFeatures;
				if (hasChanges) {
					await writeConfig(mergedFeatures, localPlans, effectiveCwd);
				}
			}

			return {
				featuresDeleted,
				featuresArchived,
				featuresSkipped,
				plansDeleted,
				plansArchived,
				plansSkipped,
				archivedConfigFeatures,
			};
		},
		onSuccess: (deletionResult) => {
			// Combine all results
			if (deletionResult.archivedConfigFeatures !== localConfig?.features) {
				setLocalConfig((prev) =>
					prev
						? {
								...prev,
								features: deletionResult.archivedConfigFeatures,
							}
						: prev,
				);
			}
			const finalResult: PushResult = {
				featuresCreated: pushFeaturesMutation.data?.created || [],
				featuresUpdated: pushFeaturesMutation.data?.updated || [],
				featuresDeleted: deletionResult.featuresDeleted,
				featuresArchived: deletionResult.featuresArchived,
				featuresSkipped: [
					...(pushFeaturesMutation.data?.skipped || []),
					...deletionResult.featuresSkipped,
				],
				plansCreated: pushPlansMutation.data?.created || [],
				plansUpdated: pushPlansMutation.data?.updated || [],
				plansVersioned: pushPlansMutation.data?.versioned || [],
				plansDeleted: deletionResult.plansDeleted,
				plansArchived: deletionResult.plansArchived,
				plansSkipped: [
					...(pushPlansMutation.data?.skipped || []),
					...deletionResult.plansSkipped,
				],
			};

			setResult(finalResult);
			setPhase("complete");

			// Call onComplete after a delay
			if (onComplete) {
				setTimeout(onComplete, 1000);
			}
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	// Respond to prompt
	const respondToPrompt = useCallback(
		(value: string) => {
			if (!currentPrompt) return;

			// Check for cancel on prod confirmation
			if (currentPrompt.type === "prod_confirmation" && value === "cancel") {
				setError("Push cancelled by user");
				setPhase("error");
				return;
			}

			setPromptResponses((prev) => {
				const next = new Map(prev);
				next.set(currentPrompt.id, value);
				return next;
			});

			// Move to next prompt or next phase
			if (currentPromptIndex + 1 >= promptQueue.length) {
				setCurrentPromptIndex(currentPromptIndex + 1);
				setPhase("pushing_features");
			} else {
				setCurrentPromptIndex(currentPromptIndex + 1);
			}
		},
		[currentPrompt, currentPromptIndex, promptQueue.length],
	);

	// Auto-start config loading
	useEffect(() => {
		if (phase === "loading_config" && !loadConfigMutation.isPending) {
			loadConfigMutation.mutate();
		}
	}, [phase, loadConfigMutation]);

	// Start analysis when org is ready
	useEffect(() => {
		if (
			phase === "loading_org" &&
			orgQuery.isSuccess &&
			localConfig &&
			!analyzeMutation.isPending
		) {
			setPhase("analyzing");
			analyzeMutation.mutate(localConfig);
		}
	}, [phase, orgQuery.isSuccess, localConfig, analyzeMutation]);

	// Start pushing features
	useEffect(() => {
		if (
			phase === "pushing_features" &&
			localConfig &&
			!pushFeaturesMutation.isPending &&
			!pushFeaturesMutation.isSuccess
		) {
			pushFeaturesMutation.mutate(localConfig);
		}
	}, [phase, localConfig, pushFeaturesMutation]);

	// Start pushing plans
	useEffect(() => {
		if (
			phase === "pushing_plans" &&
			localConfig &&
			!pushPlansMutation.isPending &&
			!pushPlansMutation.isSuccess
		) {
			pushPlansMutation.mutate(localConfig);
		}
	}, [phase, localConfig, pushPlansMutation]);

	// Handle deletions
	useEffect(() => {
		if (
			phase === "deleting" &&
			!deletionsMutation.isPending &&
			!deletionsMutation.isSuccess
		) {
			deletionsMutation.mutate();
		}
	}, [phase, deletionsMutation]);

	// Combine errors
	const combinedError =
		error || orgQuery.error ? error || formatError(orgQuery.error) : null;

	return {
		orgInfo: orgQuery.data as OrganizationInfo | null,
		analysis,
		phase,
		currentPrompt,
		respondToPrompt,
		featureProgress,
		planProgress,
		result,
		error: combinedError,
		startTime,
	};
}
