import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { useMutation } from "@tanstack/react-query";
import createJiti from "jiti";
import { useCallback, useEffect, useState } from "react";
import {
	catalogPreviewHasChanges,
	createFeatureArchivedPrompt,
	createFeatureDeletePrompt,
	createPlanArchivedPrompt,
	createPlanDeletePrompt,
	createPlanVariantPropagationPrompt,
	createPlanVersioningPrompt,
	createProdConfirmationPrompt,
	fetchRemoteData,
	previewCatalogPush,
	type PlanUpdateIntentSelections,
	type PushAnalysis,
	type PushPrompt,
	type PushResult,
	type VariantPropagationSelections,
	pushCatalog,
	unarchiveFeature as unarchiveFeatureApi,
	unarchivePlan as unarchivePlanApi,
} from "../../commands/push/index.js";
import type { Feature, Plan } from "../../compose/models/index.js";
import type { CatalogPreviewUpdateResponse } from "../api/endpoints/index.js";
import { formatError } from "../api/client.js";
import { AppEnv, resolveConfigPath } from "../env/index.js";
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

const isVariantExport = (value: unknown): boolean =>
	Boolean(
		value &&
			typeof value === "object" &&
			(value as { __atmnType?: unknown }).__atmnType === "variant",
	);

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
			if (isVariantExport(value)) continue;

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

const findPromptResponse = ({
	entityId,
	promptQueue,
	promptResponses,
	typePrefix,
}: {
	entityId: string;
	promptQueue: PushPrompt[];
	promptResponses: Map<string, string>;
	typePrefix: string;
}) => {
	const prompt = promptQueue.find(
		(candidate) =>
			candidate.type.startsWith(typePrefix) && candidate.entityId === entityId,
	);
	return prompt ? promptResponses.get(prompt.id) : undefined;
};

const variantPreviewHasChanges = (variant: {
	conflicts?: unknown[];
	customize?: unknown;
	item_changes?: unknown[];
	price_change?: unknown;
	will_apply?: boolean;
}) =>
	Boolean(
		!variant.will_apply &&
			(variant.customize ||
				variant.price_change ||
				(variant.item_changes?.length ?? 0) > 0 ||
				(variant.conflicts?.length ?? 0) > 0),
	);

const buildVariantPropagationPrompts = ({
	plans,
	preview,
}: {
	plans: Plan[];
	preview: CatalogPreviewUpdateResponse;
}): PushPrompt[] => {
	const localPlansById = new Map(plans.map((plan) => [plan.id, plan]));
	const prompts: PushPrompt[] = [];

	for (const planChange of preview.plan_changes) {
		const basePlan = localPlansById.get(planChange.plan_id);
		if (!basePlan) continue;

		for (const variant of planChange.variants ?? []) {
			if (!variantPreviewHasChanges(variant)) continue;
			prompts.push(
				createPlanVariantPropagationPrompt({
					basePlanId: planChange.plan_id,
					basePlanName: basePlan.name,
					variant,
				}),
			);
		}
	}

	return prompts;
};

const catalogPreviewToAnalysis = ({
	features,
	plans,
	preview,
	remoteData,
}: {
	features: Feature[];
	plans: Plan[];
	preview: CatalogPreviewUpdateResponse;
	remoteData: { features: Feature[]; plans: Plan[] };
}): PushAnalysis => {
	const localFeaturesById = new Map(
		features.map((feature) => [feature.id, feature]),
	);
	const localPlansById = new Map(plans.map((plan) => [plan.id, plan]));
	const remoteFeaturesById = new Map(
		remoteData.features.map((feature) => [feature.id, feature]),
	);
	const remotePlansById = new Map(
		remoteData.plans.map((plan) => [plan.id, plan]),
	);
	const analysis: PushAnalysis = {
		featuresToCreate: [],
		featuresToUpdate: [],
		featuresToDelete: [],
		plansToCreate: [],
		plansToUpdate: [],
		plansToDelete: [],
		archivedFeatures: features.filter(
			(feature) =>
				remoteFeaturesById.get(feature.id)?.archived && !feature.archived,
		),
		archivedPlans: plans.filter(
			(plan) => remotePlansById.get(plan.id)?.archived && !plan.archived,
		),
	};

	for (const change of preview.feature_changes) {
		const localFeature = localFeaturesById.get(change.feature_id);
		if (change.action === "create" && localFeature) {
			analysis.featuresToCreate.push(localFeature);
		} else if (change.action === "update" && localFeature) {
			analysis.featuresToUpdate.push(localFeature);
		} else if (change.action === "remove") {
			analysis.featuresToDelete.push({
				id: change.feature_id,
				canDelete: !change.will_archive,
				reason: change.will_archive ? "products" : undefined,
			});
		}
	}

	for (const change of preview.plan_changes) {
		const localPlan = localPlansById.get(change.plan_id);
		if (change.action === "created" && localPlan) {
			analysis.plansToCreate.push(localPlan);
		} else if (change.action === "updated" && localPlan) {
			analysis.plansToUpdate.push({
				plan: localPlan,
				willVersion: change.versionable,
				isArchived: false,
			});
		} else if (change.action === "deleted") {
			analysis.plansToDelete.push({
				id: change.plan_id,
				canDelete: !change.will_archive,
				customerCount: change.will_archive ? 1 : 0,
			});
		}
	}

	return analysis;
};

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
			const [{ preview }, remoteData] = await Promise.all([
				previewCatalogPush({
					features: config.features,
					plans: config.plans,
				}),
				fetchRemoteData(),
			]);

			return {
				analysis: catalogPreviewToAnalysis({
					features: config.features,
					plans: config.plans,
					preview,
					remoteData,
				}),
				preview,
			};
		},
		onSuccess: ({ analysis: analysisResult, preview }) => {
			setAnalysis(analysisResult);
			// Check if there are any meaningful changes to push
			// Check if there are any changes to push
			const hasChanges =
				catalogPreviewHasChanges(preview) ||
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

			prompts.push(
				...buildVariantPropagationPrompts({
					plans: localConfig?.plans ?? [],
					preview,
				}),
			);

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

			if (
				yes &&
				prompts.some((prompt) => prompt.type === "plan_variant_propagation")
			) {
				setError(
					"Variant propagation choices require interactive confirmation. Run without --yes to choose affected variants.",
				);
				setPhase("error");
				return;
			}

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

	const getSkippedFeatureIds = useCallback(() => {
		const skipped = new Set<string>();

		for (const feature of analysis?.archivedFeatures ?? []) {
			if (
				findPromptResponse({
					entityId: feature.id,
					promptQueue,
					promptResponses,
					typePrefix: "feature_archived",
				}) === "skip"
			) {
				skipped.add(feature.id);
			}
		}

		for (const info of analysis?.featuresToDelete ?? []) {
			if (
				findPromptResponse({
					entityId: info.id,
					promptQueue,
					promptResponses,
					typePrefix: "feature_delete",
				}) === "skip"
			) {
				skipped.add(info.id);
			}
		}

		return [...skipped];
	}, [analysis, promptQueue, promptResponses]);

	const getSkippedPlanIds = useCallback(() => {
		const skipped = new Set<string>();

		for (const plan of analysis?.archivedPlans ?? []) {
			if (
				findPromptResponse({
					entityId: plan.id,
					promptQueue,
					promptResponses,
					typePrefix: "plan_archived",
				}) === "skip"
			) {
				skipped.add(plan.id);
			}
		}

		for (const planInfo of analysis?.plansToUpdate ?? []) {
			if (
				planInfo.willVersion &&
				findPromptResponse({
					entityId: planInfo.plan.id,
					promptQueue,
					promptResponses,
					typePrefix: "plan_versioning",
				}) === "skip"
			) {
				skipped.add(planInfo.plan.id);
			}
		}

		for (const info of analysis?.plansToDelete ?? []) {
			if (
				findPromptResponse({
					entityId: info.id,
					promptQueue,
					promptResponses,
					typePrefix: "plan_delete",
				}) === "skip"
			) {
				skipped.add(info.id);
			}
		}

		return [...skipped];
	}, [analysis, promptQueue, promptResponses]);

	const getVariantPropagationSelections =
		useCallback((): VariantPropagationSelections => {
			const selections: VariantPropagationSelections = {};

			for (const prompt of promptQueue) {
				if (prompt.type !== "plan_variant_propagation") continue;
				if (promptResponses.get(prompt.id) !== "apply") continue;

				const basePlanId = prompt.data.basePlanId as string;
				const variantPlanId = prompt.data.variantPlanId as string;
				const variantName = prompt.data.variantName as string | undefined;
				const customize = prompt.data.customize ?? {};
				selections[basePlanId] = [
					...(selections[basePlanId] ?? []),
					{ variant_plan_id: variantPlanId, name: variantName, customize },
				];
			}

			return selections;
		}, [promptQueue, promptResponses]);

	const getPlanUpdateIntentSelections =
		useCallback((): PlanUpdateIntentSelections => {
			const selections: PlanUpdateIntentSelections = {};
			const isPlanUpdateIntent = (
				value: string | undefined,
			): value is PlanUpdateIntentSelections[string] =>
				value === "create_version" ||
				value === "update_current" ||
				value === "update_current_and_migrate";

			for (const planInfo of analysis?.plansToUpdate ?? []) {
				if (!planInfo.willVersion) continue;
				const response = findPromptResponse({
					entityId: planInfo.plan.id,
					promptQueue,
					promptResponses,
					typePrefix: "plan_versioning",
				});
				if (response === "skip") continue;
				selections[planInfo.plan.id] = isPlanUpdateIntent(response)
					? response
					: "create_version";
			}
			return selections;
		}, [analysis, promptQueue, promptResponses]);

	const pushFeaturesMutation = useMutation({
		mutationFn: async (_config: LocalConfig) => {
			const skippedFeatureIds = getSkippedFeatureIds();
			const skipped = new Set(skippedFeatureIds);

			for (const feature of analysis?.archivedFeatures ?? []) {
				if (skipped.has(feature.id)) {
					setFeatureProgress((prev) =>
						new Map(prev).set(feature.id, "skipped"),
					);
					continue;
				}
				setFeatureProgress((prev) => new Map(prev).set(feature.id, "pushing"));
				await unarchiveFeatureApi(feature.id);
			}

			for (const feature of analysis?.featuresToCreate ?? []) {
				setFeatureProgress((prev) => new Map(prev).set(feature.id, "pushing"));
			}
			for (const feature of analysis?.featuresToUpdate ?? []) {
				setFeatureProgress((prev) => new Map(prev).set(feature.id, "pushing"));
			}
			for (const info of analysis?.featuresToDelete ?? []) {
				setFeatureProgress((prev) =>
					new Map(prev).set(
						info.id,
						skipped.has(info.id) ? "skipped" : "pushing",
					),
				);
			}

			return { skippedFeatureIds };
		},
		onSuccess: () => {
			setPhase("pushing_plans");
		},
		onError: (err) => {
			setError(formatError(err));
			setPhase("error");
		},
	});

	const pushPlansMutation = useMutation({
		mutationFn: async (config: LocalConfig) => {
			const skippedFeatureIds =
				pushFeaturesMutation.data?.skippedFeatureIds ?? getSkippedFeatureIds();
			const skippedPlanIds = getSkippedPlanIds();
			const skippedPlans = new Set(skippedPlanIds);

			for (const plan of analysis?.archivedPlans ?? []) {
				if (skippedPlans.has(plan.id)) {
					setPlanProgress((prev) => new Map(prev).set(plan.id, "skipped"));
					continue;
				}
				setPlanProgress((prev) => new Map(prev).set(plan.id, "pushing"));
				await unarchivePlanApi(plan.id);
			}

			for (const plan of analysis?.plansToCreate ?? []) {
				setPlanProgress((prev) => new Map(prev).set(plan.id, "pushing"));
			}
			for (const planInfo of analysis?.plansToUpdate ?? []) {
				setPlanProgress((prev) =>
					new Map(prev).set(
						planInfo.plan.id,
						skippedPlans.has(planInfo.plan.id) ? "skipped" : "pushing",
					),
				);
			}
			for (const info of analysis?.plansToDelete ?? []) {
				setPlanProgress((prev) =>
					new Map(prev).set(
						info.id,
						skippedPlans.has(info.id) ? "skipped" : "pushing",
					),
				);
			}

			return pushCatalog({
				features: config.features,
				plans: config.plans,
				planUpdateIntentSelections: getPlanUpdateIntentSelections(),
				skipFeatureIds: skippedFeatureIds,
				skipPlanIds: skippedPlanIds,
				variantPropagationSelections: getVariantPropagationSelections(),
			});
		},
		onSuccess: (finalResult) => {
			for (const featureId of finalResult.featuresCreated) {
				setFeatureProgress((prev) => new Map(prev).set(featureId, "created"));
			}
			for (const featureId of finalResult.featuresUpdated) {
				setFeatureProgress((prev) => new Map(prev).set(featureId, "updated"));
			}
			for (const featureId of finalResult.featuresDeleted) {
				setFeatureProgress((prev) => new Map(prev).set(featureId, "deleted"));
			}
			for (const featureId of finalResult.featuresArchived) {
				setFeatureProgress((prev) => new Map(prev).set(featureId, "archived"));
			}
			for (const featureId of finalResult.featuresSkipped) {
				setFeatureProgress((prev) => new Map(prev).set(featureId, "skipped"));
			}
			for (const planId of finalResult.plansCreated) {
				setPlanProgress((prev) => new Map(prev).set(planId, "created"));
			}
			for (const planId of finalResult.plansUpdated) {
				setPlanProgress((prev) => new Map(prev).set(planId, "updated"));
			}
			for (const planId of finalResult.plansVersioned) {
				setPlanProgress((prev) => new Map(prev).set(planId, "versioned"));
			}
			for (const planId of finalResult.plansDeleted) {
				setPlanProgress((prev) => new Map(prev).set(planId, "deleted"));
			}
			for (const planId of finalResult.plansArchived) {
				setPlanProgress((prev) => new Map(prev).set(planId, "archived"));
			}
			for (const planId of finalResult.plansSkipped) {
				setPlanProgress((prev) => new Map(prev).set(planId, "skipped"));
			}

			setResult(finalResult);
			setPhase("complete");

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
