import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import createJiti from "jiti";
import type { Feature, Plan } from "../../compose/models/index.js";
import type { CatalogPreviewUpdateResponse } from "../../lib/api/endpoints/index.js";
import { withAuthRecovery } from "../../lib/auth/headlessAuthRecovery.js";
import { AppEnv, resolveConfigPath } from "../../lib/env/index.js";
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
	catalogPreviewHasChanges,
	fetchRemoteData,
	previewCatalogPush,
	pushCatalog,
	unarchiveFeature,
	unarchivePlan,
} from "./push.js";
import type { PushResult } from "./types.js";
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

type ArchivedTargets = {
	features: Feature[];
	plans: Plan[];
};

function headlessResultFromPushResult(result: PushResult): HeadlessPushResult {
	return {
		success: true,
		featuresCreated: result.featuresCreated,
		featuresUpdated: result.featuresUpdated,
		featuresDeleted: result.featuresDeleted,
		featuresArchived: result.featuresArchived,
		plansCreated: result.plansCreated,
		plansUpdated: [...result.plansUpdated, ...result.plansVersioned],
		plansDeleted: result.plansDeleted,
		plansArchived: result.plansArchived,
	};
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
function buildPromptQueueFromPreview(
	preview: CatalogPreviewUpdateResponse,
	archivedTargets: ArchivedTargets,
	environment: AppEnv,
): PushPrompt[] {
	const prompts: PushPrompt[] = [];

	if (environment === AppEnv.Live) {
		prompts.push(createProdConfirmationPrompt());
	}

	for (const feature of archivedTargets.features) {
		prompts.push(createFeatureArchivedPrompt(feature));
	}

	for (const plan of archivedTargets.plans) {
		prompts.push(createPlanArchivedPrompt(plan));
	}

	for (const planChange of preview.plan_changes) {
		if (planChange.action === "updated" && planChange.versionable) {
			prompts.push(
				createPlanVersioningPrompt(
					{
						plan: {
							id: planChange.plan_id,
							name: planChange.plan?.name ?? planChange.plan_id,
						},
						willVersion: true,
						isArchived: false,
					},
					environment,
				),
			);
		}
	}

	for (const featureChange of preview.feature_changes) {
		if (featureChange.action !== "remove") continue;
		prompts.push(
			createFeatureDeletePrompt({
				id: featureChange.feature_id,
				canDelete: !featureChange.will_archive,
				reason: featureChange.will_archive ? "products" : undefined,
			}),
		);
	}

	for (const planChange of preview.plan_changes) {
		if (planChange.action !== "deleted") continue;
		prompts.push(
			createPlanDeletePrompt({
				id: planChange.plan_id,
				canDelete: !planChange.will_archive,
				customerCount: planChange.will_archive ? 1 : 0,
			}),
		);
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

async function getArchivedTargets(config: LocalConfig): Promise<ArchivedTargets> {
	const remoteData = await fetchRemoteData();
	const remoteFeaturesById = new Map(
		remoteData.features.map((feature) => [feature.id, feature]),
	);
	const remotePlansById = new Map(remoteData.plans.map((plan) => [plan.id, plan]));

	return {
		features: config.features.filter((feature) => {
			const remote = remoteFeaturesById.get(feature.id);
			return Boolean(remote?.archived && !feature.archived);
		}),
		plans: config.plans.filter((plan) => {
			const remote = remotePlansById.get(plan.id);
			return Boolean(remote?.archived && !plan.archived);
		}),
	};
}

/**
 * Execute the push with --yes flag (auto-confirm all prompts with defaults)
 */
async function executePushWithDefaults(
	config: LocalConfig,
	archivedTargets: ArchivedTargets,
	preview: CatalogPreviewUpdateResponse,
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

	// Handle archived features - unarchive if default says so
	for (const feature of archivedTargets.features) {
		const promptId = prompts.find(
			(p) => p.type === "feature_archived" && p.entityId === feature.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;
		if (response === "unarchive") {
			console.log(chalk.dim(`  Un-archiving feature: ${feature.id}`));
			await unarchiveFeature(feature.id);
		}
	}

	// Handle archived plans - unarchive if default says so
	for (const plan of archivedTargets.plans) {
		const promptId = prompts.find(
			(p) => p.type === "plan_archived" && p.entityId === plan.id,
		)?.id;
		const response = promptId ? responses.get(promptId) : undefined;
		if (response === "unarchive") {
			console.log(chalk.dim(`  Un-archiving plan: ${plan.id}`));
			await unarchivePlan(plan.id);
		}
	}

	const pushResult = await pushCatalog({
		features: config.features,
		migrateVersioned: environment === AppEnv.Sandbox,
		plans: config.plans,
		preview,
	});
	Object.assign(result, headlessResultFromPushResult(pushResult));

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
	preview: CatalogPreviewUpdateResponse,
): Promise<HeadlessPushResult> {
	const result = await pushCatalog({
		features: config.features,
		plans: config.plans,
		preview,
	});

	return headlessResultFromPushResult(result);
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
	const [{ preview }, archivedTargets] = await Promise.all([
		previewCatalogPush({
			features: config.features,
			plans: config.plans,
		}),
		getArchivedTargets(config),
	]);

	const hasChanges =
		catalogPreviewHasChanges(preview) ||
		archivedTargets.features.length > 0 ||
		archivedTargets.plans.length > 0;

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

	const prompts = buildPromptQueueFromPreview(
		preview,
		archivedTargets,
		environment,
	);

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
			archivedTargets,
			preview,
			prompts,
			cwd,
			environment,
		);
	} else {
		// No edge cases, clean push
		result = await executeCleanPush(config, preview);
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
