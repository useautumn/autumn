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
	createPlanMigrationPrompt,
	createPlanVariantPropagationGroupPrompt,
	createPlanVersioningPrompt,
	createProdConfirmationPrompt,
	type PushPrompt,
} from "./prompts.js";
import {
	buildLatestPlanVersionById,
	catalogPreviewHasChanges,
	fetchRemoteData,
	isHistoricalPlan,
	planChangeHasHistoricalVersions,
	planTargetKey,
	previewCatalogPush,
	pushCatalog,
	unarchiveFeature,
	unarchivePlan,
} from "./push.js";
import type { PushResult } from "./types.js";
import type {
	PlanMigrationSelections,
	PlanUpdateIntent,
	PlanUpdateIntentSelections,
	VariantPropagationSelections,
} from "./types.js";
import { formatValidationErrors, validateConfig } from "./validate.js";
import { getVariantPropagationPreviews } from "./variantPropagation.js";

interface LocalConfig {
	features: Feature[];
	plans: Plan[];
}

type CombinedPlanUpdateIntent =
	| "update_current_and_migrate"
	| "update_all_versions_and_migrate";

type HeadlessPlanUpdateIntent =
	| PlanUpdateIntent
	| CombinedPlanUpdateIntent
	| "skip";

interface HeadlessPushOptions {
	cwd?: string;
	environment?: AppEnv;
	allVersions?: boolean;
	planIntents?: Record<string, HeadlessPlanUpdateIntent>;
	migrationDrafts?: Record<string, boolean>;
	variantPropagations?: Record<string, string[]>;
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

const isVariantExport = (value: unknown): boolean =>
	Boolean(
		value &&
			typeof value === "object" &&
			(value as { __atmnType?: unknown }).__atmnType === "variant",
	);

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

const formatJsonExample = () =>
	[
		"",
		chalk.cyan("Headless decision flags:"),
		`  --plan-intents '{"pro":"create_version"}'`,
		`  --plan-intents '{"pro@v1":"update_current"}'`,
		`  --plan-intents '{"pro":"update_current"}'`,
		`  --plan-intents '{"pro":"update_all_versions"}'`,
		`  --migration-drafts '{"pro":true}'`,
		`  --variant-propagations '{"pro":["pro_annual"]}'`,
	].join("\n");

const isPlanUpdateIntent = (value: unknown): value is PlanUpdateIntent =>
	value === "create_version" ||
	value === "update_current" ||
	value === "update_all_versions";

const normalizePlanIntent = ({
	intent,
}: {
	intent: HeadlessPlanUpdateIntent;
}): {
	createMigration?: boolean;
	intent: PlanUpdateIntent | "skip" | null;
} => {
	if (intent === "update_current_and_migrate") {
		return { intent: "update_current", createMigration: true };
	}
	if (intent === "update_all_versions_and_migrate") {
		return { intent: "update_all_versions", createMigration: true };
	}
	if (intent === "skip" || isPlanUpdateIntent(intent)) return { intent };
	return { intent: null };
};

const formatVariantConflict = (conflict: unknown): string => {
	if (!conflict || typeof conflict !== "object") return "unknown conflict";
	const value = conflict as {
		feature_name?: string;
		item_filter?: { interval?: string };
		reason?: string;
	};
	const feature = value.feature_name ?? "unknown feature";
	const interval = value.item_filter?.interval
		? ` (${value.item_filter.interval})`
		: "";
	return `${feature}: ${value.reason ?? "conflict"}${interval}`;
};

function resolveHeadlessUpdateDecisions({
	migrationDrafts = {},
	planIntents = {},
	prompts,
	variantPropagations = {},
}: {
	migrationDrafts?: HeadlessPushOptions["migrationDrafts"];
	planIntents?: HeadlessPushOptions["planIntents"];
	prompts: PushPrompt[];
	variantPropagations?: HeadlessPushOptions["variantPropagations"];
}): {
	missing: string[];
	planMigrationSelections: PlanMigrationSelections;
	planUpdateIntentSelections: PlanUpdateIntentSelections;
	skipPlanIds: string[];
	variantPropagationSelections: VariantPropagationSelections;
} {
	const missing: string[] = [];
	const planMigrationSelections: PlanMigrationSelections = {};
	const planUpdateIntentSelections: PlanUpdateIntentSelections = {};
	const skipPlanIds: string[] = [];
	const variantPropagationSelections: VariantPropagationSelections = {};

	for (const prompt of prompts) {
		if (prompt.type !== "plan_versioning") continue;
		const intent = planIntents[prompt.entityId];
		if (!intent) {
			missing.push(`plan "${prompt.entityId}" needs a plan intent`);
			continue;
		}
		const normalized = normalizePlanIntent({ intent });
		if (normalized.intent === "skip") {
			skipPlanIds.push(prompt.entityId);
			continue;
		}
		if (normalized.intent === null) {
			missing.push(`plan "${prompt.entityId}" has invalid plan intent`);
			continue;
		}
		planUpdateIntentSelections[prompt.entityId] = normalized.intent;
		if (normalized.createMigration !== undefined) {
			planMigrationSelections[prompt.entityId] = normalized.createMigration;
		}
	}

	for (const prompt of prompts) {
		if (prompt.type !== "plan_migration") continue;
		if (skipPlanIds.includes(prompt.entityId)) continue;
		if (planUpdateIntentSelections[prompt.entityId] === "create_version") {
			continue;
		}
		const selected = migrationDrafts[prompt.entityId];
		if (selected === undefined) {
			if (prompt.entityId in planMigrationSelections) continue;
			missing.push(`plan "${prompt.entityId}" needs a migration draft choice`);
			continue;
		}
		planMigrationSelections[prompt.entityId] = selected;
	}

	for (const prompt of prompts) {
		if (prompt.type !== "plan_variant_propagation") continue;
		const basePlanId = prompt.data.basePlanId as string;
		if (skipPlanIds.includes(basePlanId)) continue;
		if (!(basePlanId in variantPropagations)) {
			missing.push(`plan "${basePlanId}" needs variant propagation choices`);
			continue;
		}

		const variants = prompt.data.variants as
			| {
					customize?: unknown;
					variantName?: string;
					variantPlanId: string;
			  }[]
			| undefined;
		if (variants) {
			const selectedIds = new Set(variantPropagations[basePlanId] ?? []);
			variantPropagationSelections[basePlanId] = variants
				.filter((variant) => selectedIds.has(variant.variantPlanId))
				.map((variant) => ({
					variant_plan_id: variant.variantPlanId,
					name: variant.variantName,
					customize: variant.customize ?? {},
				}));
			continue;
		}

		const variantPlanId = prompt.data.variantPlanId as string;
		if (!variantPropagations[basePlanId]?.includes(variantPlanId)) continue;

		variantPropagationSelections[basePlanId] = [
			...(variantPropagationSelections[basePlanId] ?? []),
			{
				variant_plan_id: variantPlanId,
				name: prompt.data.variantName as string | undefined,
				customize: prompt.data.customize ?? {},
			},
		];
	}

	return {
		missing: [...new Set(missing)],
		planMigrationSelections,
		planUpdateIntentSelections,
		skipPlanIds,
		variantPropagationSelections,
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
			if (isVariantExport(value)) continue;

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
	plans: Plan[],
): PushPrompt[] {
	const prompts: PushPrompt[] = [];
	const latestVersionById = buildLatestPlanVersionById(plans);
	const planForChange = (
		planChange: CatalogPreviewUpdateResponse["plan_changes"][number],
		index: number,
	) => {
		const indexedPlan = plans[index];
		return indexedPlan?.id === planChange.plan_id ? indexedPlan : undefined;
	};

	if (environment === AppEnv.Live) {
		prompts.push(createProdConfirmationPrompt());
	}

	for (const feature of archivedTargets.features) {
		prompts.push(createFeatureArchivedPrompt(feature));
	}

	for (const plan of archivedTargets.plans) {
		prompts.push(createPlanArchivedPrompt(plan));
	}

	for (const [index, planChange] of preview.plan_changes.entries()) {
		const localPlan = planForChange(planChange, index);
		if (planChange.action !== "updated" || !localPlan) continue;

		const hasHistoricalVersions = planChangeHasHistoricalVersions({
			planChange,
		});
		const shouldPrompt =
			!isHistoricalPlan({ latestVersionById, plan: localPlan }) &&
			(planChange.versionable || hasHistoricalVersions);
		if (shouldPrompt) {
			const plan = {
				id: planChange.plan_id,
				name: planChange.plan?.name ?? planChange.plan_id,
			};
			prompts.push(
				createPlanVersioningPrompt(
					{
						plan,
						willVersion: planChange.versionable,
						isArchived: false,
						hasHistoricalVersions,
					},
					environment,
				),
			);
			prompts.push(createPlanMigrationPrompt({ plan }));
		}
	}

	for (const [index, planChange] of preview.plan_changes.entries()) {
		const basePlan = planForChange(planChange, index);
		if (!basePlan) continue;

		const affectedVariants = getVariantPropagationPreviews({ planChange });
		if (affectedVariants.length === 0) continue;

		prompts.push(
			createPlanVariantPropagationGroupPrompt({
				basePlanId: planChange.plan_id,
				basePlanName: basePlan.name,
				variants: affectedVariants,
			}),
		);
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
					`  - Plan "${prompt.entityId}" needs an update intent; choose create_version, update_current, update_all_versions, or skip`,
				);
				break;
			case "plan_migration":
				issues.push(
					`  - Plan "${prompt.entityId}" needs a migration draft choice`,
				);
				break;
			case "plan_variant_propagation": {
				const conflicts =
					(prompt.data.conflicts as unknown[] | undefined) ?? [];
				issues.push(
					`  - Variant "${prompt.entityId}" may receive base plan changes from "${prompt.data.basePlanId}"`,
				);
				for (const conflict of conflicts) {
					issues.push(`    conflict: ${formatVariantConflict(conflict)}`);
				}
				break;
			}
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

async function getArchivedTargets(
	config: LocalConfig,
	allVersions = false,
): Promise<ArchivedTargets> {
	const remoteData = await fetchRemoteData({ allVersions });
	const remoteFeaturesById = new Map(
		remoteData.features.map((feature) => [feature.id, feature]),
	);
	const remotePlansById = new Map(
		remoteData.plans.map((plan) => [planTargetKey(plan), plan]),
	);

	return {
		features: config.features.filter((feature) => {
			const remote = remoteFeaturesById.get(feature.id);
			return Boolean(remote?.archived && !feature.archived);
		}),
		plans: config.plans.filter((plan) => {
			const remote = remotePlansById.get(planTargetKey(plan));
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
	decisions: {
		planMigrationSelections?: PlanMigrationSelections;
		planUpdateIntentSelections?: PlanUpdateIntentSelections;
		skipPlanIds?: string[];
		variantPropagationSelections?: VariantPropagationSelections;
	} = {},
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
		cwd,
		features: config.features,
		plans: config.plans,
		planMigrationSelections: decisions.planMigrationSelections,
		planUpdateIntentSelections: decisions.planUpdateIntentSelections,
		preview,
		skipPlanIds: decisions.skipPlanIds,
		variantPropagationSelections: decisions.variantPropagationSelections,
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
	const allVersions = options.allVersions ?? false;
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
		getArchivedTargets(config, allVersions),
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
		config.plans,
	);
	const decisions = resolveHeadlessUpdateDecisions({
		migrationDrafts: options.migrationDrafts,
		planIntents: options.planIntents,
		prompts,
		variantPropagations: options.variantPropagations,
	});
	if (decisions.missing.length > 0) {
		console.log(chalk.yellow("\nPush requires update-flow decisions:"));
		for (const missing of decisions.missing) {
			console.log(`  - ${missing}`);
		}
		console.log(formatJsonExample());
		process.exit(1);
	}

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
			chalk.white("  2. Run with --yes plus explicit headless decision flags"),
		);
		console.log(formatJsonExample());
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
			{
				planMigrationSelections: decisions.planMigrationSelections,
				planUpdateIntentSelections: decisions.planUpdateIntentSelections,
				skipPlanIds: decisions.skipPlanIds,
				variantPropagationSelections: decisions.variantPropagationSelections,
			},
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
