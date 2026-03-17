import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import createJiti from "jiti";
import type { Feature, Plan } from "../../compose/models/index.js";
import { fetchPlans, migrateProduct } from "../../lib/api/endpoints/index.js";
import { withAuthRecovery } from "../../lib/auth/headlessAuthRecovery.js";
import { AppEnv, getKey, resolveConfigPath } from "../../lib/env/index.js";
import { writeConfig } from "../pull/writeConfig.js";
import {
	createFeatureArchivedPrompt,
	createFeatureDeletePrompt,
	createPlanArchivedPrompt,
	createPlanDeletePrompt,
	createPlanVersioningPrompt,
	createProdConfirmationPrompt,
	type PushPrompt,
} from "./prompts.js";
import {
	analyzePush,
	archiveFeature,
	archivePlan,
	checkFeatureDeleteInfo,
	deleteFeature,
	deletePlan,
	fetchRemoteData,
	pushFeature,
	pushPlan,
	refreshPlansForVersioning,
	unarchiveFeature,
	unarchivePlan,
} from "./push.js";
import type { PushAnalysis } from "./types.js";
import { formatValidationErrors, validateConfig } from "./validate.js";

interface LocalConfig {
	features: Feature[];
	plans: Plan[];
}

interface HeadlessPushOptions {
	cwd?: string;
	environment?: AppEnv;
	yes?: boolean;
}

interface HeadlessPushResult {
	success: boolean;
	featuresCreated: string[];
	featuresUpdated: string[];
	featuresDeleted: string[];
	featuresArchived: string[];
	plansCreated: string[];
	plansUpdated: string[];
	plansDeleted: string[];
	plansArchived: string[];
}

/**
 * Load local config file using jiti
 */
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

/**
 * Build the list of prompts that would be shown in interactive mode
 */
function buildPromptQueue(
	analysis: PushAnalysis,
	environment: AppEnv,
): PushPrompt[] {
	const prompts: PushPrompt[] = [];

	// Production confirmation
	if (environment === AppEnv.Live) {
		prompts.push(createProdConfirmationPrompt());
	}

	// Archived features
	for (const feature of analysis.archivedFeatures) {
		prompts.push(createFeatureArchivedPrompt(feature));
	}

	// Archived plans
	for (const plan of analysis.archivedPlans) {
		prompts.push(createPlanArchivedPrompt(plan));
	}

	// Plans that will version
	for (const planInfo of analysis.plansToUpdate) {
		if (planInfo.willVersion) {
			prompts.push(createPlanVersioningPrompt(planInfo, environment));
		}
	}

	// Feature deletions
	for (const info of analysis.featuresToDelete) {
		prompts.push(createFeatureDeletePrompt(info));
	}

	// Plan deletions
	for (const info of analysis.plansToDelete) {
		prompts.push(createPlanDeletePrompt(info));
	}

	return prompts;
}

/**
 * Format a human-readable description of the issues that require confirmation
 */
function formatIssuesSummary(prompts: PushPrompt[]): string {
	const issues: string[] = [];

	for (const prompt of prompts) {
		switch (prompt.type) {
			case "prod_confirmation":
				issues.push("  - Pushing to production environment");
				break;
			case "plan_versioning":
				issues.push(
					`  - Plan "${prompt.entityId}" has customers and will create a new version`,
				);
				break;
			case "plan_delete_has_customers":
				issues.push(
					`  - Plan "${prompt.entityId}" needs to be removed but has customers`,
				);
				break;
			case "plan_delete_no_customers":
				issues.push(`  - Plan "${prompt.entityId}" will be deleted`);
				break;
			case "plan_archived":
				issues.push(
					`  - Plan "${prompt.entityId}" is archived and needs to be un-archived`,
				);
				break;
			case "feature_delete_credit_system":
				issues.push(
					`  - Feature "${prompt.entityId}" is used by credit systems and cannot be deleted`,
				);
				break;
			case "feature_delete_products":
				issues.push(
					`  - Feature "${prompt.entityId}" is used by products and cannot be deleted`,
				);
				break;
			case "feature_delete_no_deps":
				issues.push(`  - Feature "${prompt.entityId}" will be deleted`);
				break;
			case "feature_archived":
				issues.push(
					`  - Feature "${prompt.entityId}" is archived and needs to be un-archived`,
				);
				break;
		}
	}

	return issues.join("\n");
}

async function syncArchivedFeaturesToConfig(
	config: LocalConfig,
	archivedFeatureIds: string[],
	cwd: string,
): Promise<void> {
	const uniqueIds = [...new Set(archivedFeatureIds)];
	if (uniqueIds.length === 0) {
		return;
	}

	const remoteData = await fetchRemoteData();
	const remoteFeatureMap = new Map(remoteData.features.map((f) => [f.id, f]));

	const localFeaturesById = new Map(config.features.map((f) => [f.id, f]));
	let hasChanges = false;

	for (const featureId of uniqueIds) {
		const existingFeature = localFeaturesById.get(featureId);
		if (existingFeature) {
			if (existingFeature.archived) {
				continue;
			}
			localFeaturesById.set(featureId, {
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

		localFeaturesById.set(featureId, {
			...(remoteFeature as Feature),
			archived: true,
		});
		hasChanges = true;
	}

	if (!hasChanges) {
		return;
	}

	await writeConfig(Array.from(localFeaturesById.values()), config.plans, cwd);
}

/**
 * Execute the push with --yes flag (auto-confirm all prompts with defaults)
 */
async function executePushWithDefaults(
	config: LocalConfig,
	analysis: PushAnalysis,
	prompts: PushPrompt[],
	cwd: string,
	environment: AppEnv,
): Promise<HeadlessPushResult> {
	const result: HeadlessPushResult = {
		success: true,
		featuresCreated: [],
		featuresUpdated: [],
		featuresDeleted: [],
		featuresArchived: [],
		plansCreated: [],
		plansUpdated: [],
		plansDeleted: [],
		plansArchived: [],
	};

	// Build response map from defaults
	const responses = new Map<string, string>();
	for (const prompt of prompts) {
		if (prompt.type === "prod_confirmation") {
			responses.set(prompt.id, "confirm");
			continue;
		}
		const defaultOption = prompt.options.find((o) => o.isDefault);
		responses.set(
			prompt.id,
			defaultOption?.value || prompt.options[0]?.value || "confirm",
		);
	}

	// Get remote plans for pushPlan
	const remoteData = await fetchRemoteData();
	const remotePlans = remoteData.plans;

	// Handle archived features - unarchive if default says so
	for (const feature of analysis.archivedFeatures) {
		const promptId = prompts.find(
			(p) => p.type === "feature_archived" && p.entityId === feature.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;
		if (response === "unarchive") {
			console.log(chalk.dim(`  Un-archiving feature: ${feature.id}`));
			await unarchiveFeature(feature.id);
		}
	}

	// Push features — credit_system features must come after their metered dependencies
	const allFeatures = [...config.features].sort((a, b) => {
		if (a.type === "credit_system" && b.type !== "credit_system") return 1;
		if (a.type !== "credit_system" && b.type === "credit_system") return -1;
		return 0;
	});
	for (const feature of allFeatures) {
		const isArchived = analysis.archivedFeatures.some(
			(af) => af.id === feature.id,
		);
		if (isArchived) {
			const promptId = prompts.find(
				(p) => p.type === "feature_archived" && p.entityId === feature.id,
			)?.id;
			const response = promptId ? responses.get(promptId) : undefined;
			if (response === "skip") {
				continue;
			}
		}

		const pushResult = await pushFeature(feature);
		if (pushResult.action === "created") {
			result.featuresCreated.push(feature.id);
		} else {
			result.featuresUpdated.push(feature.id);
		}
	}

	// Handle archived plans - unarchive if default says so
	for (const plan of analysis.archivedPlans) {
		const promptId = prompts.find(
			(p) => p.type === "plan_archived" && p.entityId === plan.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;
		if (response === "unarchive") {
			console.log(chalk.dim(`  Un-archiving plan: ${plan.id}`));
			await unarchivePlan(plan.id);
		}
	}

	// Push plans to create
	for (const plan of analysis.plansToCreate) {
		await pushPlan(plan, remotePlans);
		result.plansCreated.push(plan.id);
	}

	const refreshedPlanUpdates = await refreshPlansForVersioning(
		analysis.plansToUpdate,
		config.features,
	);
	const planUpdateById = new Map(
		refreshedPlanUpdates.map((planInfo) => [planInfo.plan.id, planInfo]),
	);

	// Push plans to update
	for (const planInfo of analysis.plansToUpdate) {
		const refreshedPlanInfo = planUpdateById.get(planInfo.plan.id) ?? planInfo;

		const versioningPromptId = prompts.find(
			(p) => p.type === "plan_versioning" && p.entityId === planInfo.plan.id,
		)?.id;
		const versioningResponse = versioningPromptId
			? responses.get(versioningPromptId)
			: undefined;

		if (refreshedPlanInfo.willVersion && versioningResponse === "skip") {
			continue;
		}

		if (planInfo.isArchived || refreshedPlanInfo.isArchived) {
			const promptId = prompts.find(
				(p) => p.type === "plan_archived" && p.entityId === planInfo.plan.id,
			)?.id;
			const response = promptId ? responses.get(promptId) : undefined;
			if (response === "skip") {
				continue;
			}
		}

		await pushPlan(planInfo.plan, remotePlans);

		if (
			refreshedPlanInfo.willVersion &&
			versioningResponse === "version_and_migrate"
		) {
			const secretKey = getKey(environment);
			const updatedPlans = await fetchPlans({
				secretKey,
				includeArchived: false,
			});
			const updatedPlan = updatedPlans.find((p) => p.id === planInfo.plan.id);
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

		if (refreshedPlanInfo.willVersion) {
			result.plansUpdated.push(refreshedPlanInfo.plan.id);
		} else {
			result.plansUpdated.push(planInfo.plan.id);
		}
	}

	// Handle plan deletions first so feature dependencies are removed first
	for (const info of analysis.plansToDelete) {
		const promptId = prompts.find(
			(p) => p.type.startsWith("plan_delete") && p.entityId === info.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;

		if (response === "delete") {
			console.log(chalk.dim(`  Deleting plan: ${info.id}`));
			await deletePlan(info.id);
			result.plansDeleted.push(info.id);
		} else if (response === "archive") {
			console.log(chalk.dim(`  Archiving plan: ${info.id}`));
			await archivePlan(info.id);
			result.plansArchived.push(info.id);
		}
		// skip = do nothing
	}

	const latestRemoteData = await fetchRemoteData();
	const refreshedFeatureDeleteInfo = new Map<string, boolean>();
	if (analysis.featuresToDelete.length > 0) {
		const refreshedInfos = await Promise.all(
			analysis.featuresToDelete.map((featureInfo) =>
				checkFeatureDeleteInfo(
					featureInfo.id,
					config.features,
					latestRemoteData.features,
				),
			),
		);
		for (const info of refreshedInfos) {
			refreshedFeatureDeleteInfo.set(info.id, info.canDelete);
		}
	}

	// Handle feature deletions
	for (const info of analysis.featuresToDelete) {
		const promptId = prompts.find(
			(p) => p.type.startsWith("feature_delete") && p.entityId === info.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;
		const canDelete = refreshedFeatureDeleteInfo.get(info.id) ?? info.canDelete;

		if (response === "delete") {
			if (!canDelete) {
				console.log(chalk.yellow(`  Skipping feature delete: ${info.id}`));
				continue;
			}
			console.log(chalk.dim(`  Deleting feature: ${info.id}`));
			await deleteFeature(info.id);
			result.featuresDeleted.push(info.id);
		} else if (response === "archive") {
			console.log(chalk.dim(`  Archiving feature: ${info.id}`));
			await archiveFeature(info.id);
			result.featuresArchived.push(info.id);
		}
		// skip = do nothing
	}

	if (result.featuresArchived.length > 0) {
		await syncArchivedFeaturesToConfig(config, result.featuresArchived, cwd);
	}

	return result;
}

/**
 * Execute a clean push (no edge cases, no prompts needed)
 */
async function executeCleanPush(
	config: LocalConfig,
	analysis: PushAnalysis,
): Promise<HeadlessPushResult> {
	const result: HeadlessPushResult = {
		success: true,
		featuresCreated: [],
		featuresUpdated: [],
		featuresDeleted: [],
		featuresArchived: [],
		plansCreated: [],
		plansUpdated: [],
		plansDeleted: [],
		plansArchived: [],
	};

	const remoteData = await fetchRemoteData();
	const remotePlans = remoteData.plans;

	// Push all features — credit_system features must come after their metered dependencies
	const sortedFeatures = [...config.features].sort((a, b) => {
		if (a.type === "credit_system" && b.type !== "credit_system") return 1;
		if (a.type !== "credit_system" && b.type === "credit_system") return -1;
		return 0;
	});
	for (const feature of sortedFeatures) {
		const pushResult = await pushFeature(feature);
		if (pushResult.action === "created") {
			result.featuresCreated.push(feature.id);
		} else {
			result.featuresUpdated.push(feature.id);
		}
	}

	// Push plans to create
	for (const plan of analysis.plansToCreate) {
		await pushPlan(plan, remotePlans);
		result.plansCreated.push(plan.id);
	}

	// Push plans to update (no versioning issues since prompts.length === 0)
	for (const planInfo of analysis.plansToUpdate) {
		await pushPlan(planInfo.plan, remotePlans);
		result.plansUpdated.push(planInfo.plan.id);
	}

	return result;
}

/**
 * Headless push command - uses V2 logic without interactive prompts
 *
 * If any edge cases require user decisions and --yes is not set,
 * exits with a helpful message instructing the user to either:
 * - Run in an interactive terminal
 * - Use the --yes flag to auto-confirm with defaults
 *
 * Automatically handles 401 errors by running OAuth flow and retrying.
 */
export async function headlessPush(
	options: HeadlessPushOptions = {},
): Promise<HeadlessPushResult> {
	// Wrap the entire push operation with auth recovery
	return withAuthRecovery(async () => {
		return await _headlessPushImpl(options);
	});
}

/**
 * Internal implementation of headless push
 */
async function _headlessPushImpl(
	options: HeadlessPushOptions = {},
): Promise<HeadlessPushResult> {
	const cwd = options.cwd ?? process.cwd();
	const environment = options.environment ?? AppEnv.Sandbox;
	const yes = options.yes ?? false;

	const envLabel = environment === AppEnv.Live ? "production" : "sandbox";

	// Load config
	console.log(chalk.dim(`Loading autumn.config.ts...`));
	const config = await loadLocalConfig(cwd);
	console.log(
		chalk.dim(
			`  Found ${config.features.length} features, ${config.plans.length} plans`,
		),
	);

	// Validate config for missing required fields
	console.log(chalk.dim(`Validating config...`));
	const validation = validateConfig(config.features, config.plans);
	if (!validation.valid) {
		console.log(chalk.red("\nConfig validation failed:\n"));
		console.log(chalk.yellow(formatValidationErrors(validation.errors)));
		process.exit(1);
	}

	// Analyze changes
	console.log(chalk.dim(`Analyzing changes against ${envLabel}...`));
	const analysis = await analyzePush(config.features, config.plans);

	// Check if there are any changes that require action
	const hasChanges =
		analysis.featuresToCreate.length > 0 ||
		analysis.featuresToUpdate.length > 0 ||
		analysis.featuresToDelete.length > 0 ||
		analysis.plansToCreate.length > 0 ||
		analysis.plansToUpdate.length > 0 ||
		analysis.plansToDelete.length > 0 ||
		analysis.archivedFeatures.length > 0 ||
		analysis.archivedPlans.length > 0;

	if (!hasChanges) {
		console.log(chalk.green("\nAlready in sync - no changes to push."));
		return {
			success: true,
			featuresCreated: [],
			featuresUpdated: [],
			featuresDeleted: [],
			featuresArchived: [],
			plansCreated: [],
			plansUpdated: [],
			plansDeleted: [],
			plansArchived: [],
		};
	}

	// Build prompt queue to check for edge cases
	const prompts = buildPromptQueue(analysis, environment);

	// If there are prompts and --yes is not set, exit with helpful message
	if (prompts.length > 0 && !yes) {
		console.log(
			chalk.yellow("\nPush requires confirmation for the following:"),
		);
		console.log(formatIssuesSummary(prompts));
		console.log("");
		console.log(chalk.cyan("To proceed, either:"));
		console.log(
			chalk.white(
				"  1. Run this command in an interactive terminal to review and confirm each action",
			),
		);
		console.log(
			chalk.white(
				"  2. Run with --yes to automatically proceed with default actions",
			),
		);
		console.log("");

		// Exit with non-zero to indicate action required
		process.exit(1);
	}

	// Execute the push
	console.log(chalk.dim(`\nPushing to ${envLabel}...`));

	let result: HeadlessPushResult;
	if (prompts.length > 0) {
		// --yes was set, execute with defaults
		result = await executePushWithDefaults(
			config,
			analysis,
			prompts,
			cwd,
			environment,
		);
	} else {
		// No edge cases, clean push
		result = await executeCleanPush(config, analysis);
	}

	// Print summary
	console.log(chalk.green(`\nPush complete!`));

	if (result.featuresCreated.length > 0) {
		console.log(
			chalk.dim(`  Features created: ${result.featuresCreated.join(", ")}`),
		);
	}
	if (result.featuresUpdated.length > 0) {
		console.log(
			chalk.dim(`  Features updated: ${result.featuresUpdated.join(", ")}`),
		);
	}
	if (result.featuresDeleted.length > 0) {
		console.log(
			chalk.dim(`  Features deleted: ${result.featuresDeleted.join(", ")}`),
		);
	}
	if (result.featuresArchived.length > 0) {
		console.log(
			chalk.dim(`  Features archived: ${result.featuresArchived.join(", ")}`),
		);
	}
	if (result.plansCreated.length > 0) {
		console.log(
			chalk.dim(`  Plans created: ${result.plansCreated.join(", ")}`),
		);
	}
	if (result.plansUpdated.length > 0) {
		console.log(
			chalk.dim(`  Plans updated: ${result.plansUpdated.join(", ")}`),
		);
	}
	if (result.plansDeleted.length > 0) {
		console.log(
			chalk.dim(`  Plans deleted: ${result.plansDeleted.join(", ")}`),
		);
	}
	if (result.plansArchived.length > 0) {
		console.log(
			chalk.dim(`  Plans archived: ${result.plansArchived.join(", ")}`),
		);
	}

	return result;
}
