import { existsSync, writeFileSync } from "node:fs";
import type { ReferralProgram, Reward } from "../../../compose/index.js";
import type { Feature } from "../../../compose/models/index.js";
import type { Plan } from "../../../compose/models/variantModels.js";
import {
	DEFAULT_REWARD_EXPORT_ERROR,
	loadConfigModule,
} from "../../config/loadConfig.js";
import { resolveConfigPath } from "../../env/index.js";
import { buildFeatureCode } from "../sdkToCode/feature.js";
import {
	claimVarName,
	featureIdToVarName,
	idToVarName,
	planIdToVarName,
	variantIdToVarName,
	versionedCodegenId,
} from "../sdkToCode/helpers.js";
import { buildImports } from "../sdkToCode/imports.js";
import { buildPlanCode } from "../sdkToCode/plan.js";
import {
	buildReferralProgramCode,
	buildRewardCode,
} from "../sdkToCode/reward.js";
import { buildVariantCode } from "../sdkToCode/variant.js";
import {
	type ParsedEntity,
	type ParsedIdentity,
	parseExistingConfig,
} from "./parseConfig.js";

export interface UpdateResult {
	featuresUpdated: number;
	featuresAdded: number;
	featuresDeleted: number;
	plansUpdated: number;
	plansAdded: number;
	plansDeleted: number;
}

function generateFeatureCode(
	feature: Feature,
	existingVarName?: string,
): string {
	return buildFeatureCode(feature, existingVarName);
}

function generatePlanCode(
	plan: Plan,
	features: Feature[],
	existingVarName?: string,
	featureVarMap?: Map<string, string>,
): string {
	return buildPlanCode(plan, features, featureVarMap, existingVarName);
}

function generatePlanWithVariantsCode({
	featureVarMap,
	features,
	plan,
	planVarName,
	variantVarMap,
}: {
	featureVarMap?: Map<string, string>;
	features: Feature[];
	plan: Plan;
	planVarName?: string;
	variantVarMap: Map<string, string>;
}): string {
	const basePlanCode = generatePlanCode(
		plan,
		features,
		planVarName,
		featureVarMap,
	);
	const basePlanVarName = planVarName ?? planIdToVarName(plan.id);
	const variantCodes = (plan.variants ?? []).map((variant) =>
		buildVariantCode({
			basePlanVarName,
			variant,
			features,
			featureVarMap,
			varNameOverride: variantVarMap.get(versionedCodegenId(variant)),
		}),
	);

	return [basePlanCode, ...variantCodes].join("\n\n");
}

const ensureAtmnImports = (importText: string, imports: string[]) =>
	imports.reduce(
		(text, name) =>
			new RegExp(`\\b${name}\\b`).test(text)
				? text
				: text.replace(/\{/, `{ ${name},`),
		importText,
	);

const versionedIds = (resources: ParsedIdentity[]) =>
	new Set(
		resources.flatMap(({ id, version }) => (version === undefined ? [] : [id])),
	);

export async function updateConfigInPlace({
	features,
	plans,
	cwd = process.cwd(),
	rewards,
	referralPrograms,
}: {
	features: Feature[];
	plans: Plan[];
	cwd?: string;
	rewards?: Reward[];
	referralPrograms?: ReferralProgram[];
}): Promise<UpdateResult> {
	const configPath = resolveConfigPath(cwd);

	if (!existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}

	let parsed = parseExistingConfig({ configPath });
	const hasDefaultResources =
		/\bexport\s+default\b/.test(parsed.source) &&
		/\b(?:rewards|referralPrograms)\b/.test(parsed.source);
	if (hasDefaultResources) throw new Error(DEFAULT_REWARD_EXPORT_ERROR);
	const versionedIdsByType = new Map<ParsedEntity["type"], Set<string>>([
		["plan", versionedIds(plans)],
		["variant", versionedIds(plans.flatMap((plan) => plan.variants ?? []))],
	]);
	const runtimeDeclarations = parsed.blocks.flatMap(
		({ declaration, entity }) =>
			declaration &&
			(declaration.requiresRuntimeIdentity ||
				(entity && versionedIdsByType.get(entity.type)?.has(entity.id)))
				? [declaration]
				: [],
	);
	if (runtimeDeclarations.length) {
		const mod = await loadConfigModule({ cwd });
		const identitiesByTypeAndVarName = new Map<
			ParsedEntity["type"],
			Map<string, ParsedIdentity>
		>();
		for (const declaration of runtimeDeclarations) {
			const value = mod[declaration.varName] as
				| { id?: unknown; version?: unknown }
				| undefined;
			if (typeof value?.id !== "string")
				throw new Error(
					`Could not resolve the ID of export '${declaration.varName}'.`,
				);
			const identities =
				identitiesByTypeAndVarName.get(declaration.type) ?? new Map();
			identities.set(declaration.varName, {
				id: value.id,
				version: typeof value.version === "number" ? value.version : undefined,
			});
			identitiesByTypeAndVarName.set(declaration.type, identities);
		}
		parsed = parseExistingConfig({ configPath, identitiesByTypeAndVarName });
	}
	const requiredImports = [
		...(plans.some((plan) => plan.billingControls) ? ["billingControls"] : []),
		...(rewards?.length ? ["reward"] : []),
		...(referralPrograms?.length ? ["referralProgram"] : []),
	];
	const result: UpdateResult = {
		featuresUpdated: 0,
		featuresAdded: 0,
		featuresDeleted: 0,
		plansUpdated: 0,
		plansAdded: 0,
		plansDeleted: 0,
	};

	const apiFeatureMap = new Map(features.map((f) => [f.id, f]));
	const apiPlanMap = new Map(plans.map((p) => [versionedCodegenId(p), p]));
	const apiRewardMap = new Map(
		(rewards ?? []).map((reward) => [reward.id, reward]),
	);
	const apiReferralProgramMap = new Map(
		(referralPrograms ?? []).map((program) => [program.id, program]),
	);
	const apiVariantMap = new Map(
		plans.flatMap((plan) =>
			(plan.variants ?? []).map(
				(variant) => [versionedCodegenId(variant), variant] as const,
			),
		),
	);

	const featureVarMap = new Map<string, string>();
	const existingVariantVarMap = new Map<string, string>();
	for (const entity of parsed.entities) {
		if (entity.type === "feature") {
			featureVarMap.set(entity.id, entity.varName);
		} else if (entity.type === "variant") {
			existingVariantVarMap.set(versionedCodegenId(entity), entity.varName);
		}
	}

	const existingVarNames = new Set(
		[...parsed.source.matchAll(/export\s+const\s+([\w$]+)\s*=/g)].flatMap(
			([, varName]) => (varName ? [varName] : []),
		),
	);

	const newFeatureIds = features
		.filter((f) => !featureVarMap.has(f.id))
		.map((f) => f.id);

	const newFeatureVarMap = new Map<string, string>();
	for (const id of newFeatureIds) {
		const varName = claimVarName({
			candidate: featureIdToVarName(id),
			suffix: "Feature",
			usedNames: existingVarNames,
		});
		newFeatureVarMap.set(id, varName);
		featureVarMap.set(id, varName);
	}

	const existingPlanIds = new Set(
		parsed.entities.filter((e) => e.type === "plan").map(versionedCodegenId),
	);
	const newPlanIds = plans
		.filter((p) => !existingPlanIds.has(versionedCodegenId(p)))
		.map(versionedCodegenId);

	const newPlanVarMap = new Map<string, string>();
	for (const id of newPlanIds) {
		const varName = claimVarName({
			candidate: planIdToVarName(id),
			suffix: "Plan",
			usedNames: existingVarNames,
		});
		newPlanVarMap.set(id, varName);
	}

	const variantVarMap = new Map<string, string>();
	for (const key of apiVariantMap.keys()) {
		if (existingVariantVarMap.has(key)) {
			variantVarMap.set(key, existingVariantVarMap.get(key)!);
			continue;
		}

		const varName = claimVarName({
			candidate: variantIdToVarName(key),
			suffix: "Variant",
			usedNames: existingVarNames,
		});
		variantVarMap.set(key, varName);
	}

	const newRewardVarMap = new Map<string, string>();
	for (const { id } of rewards ?? []) {
		if (
			parsed.entities.some(
				(entity) => entity.type === "reward" && entity.id === id,
			)
		)
			continue;
		newRewardVarMap.set(
			id,
			claimVarName({
				candidate: idToVarName(`reward-${id}`),
				suffix: "Reward",
				usedNames: existingVarNames,
			}),
		);
	}

	const newReferralProgramVarMap = new Map<string, string>();
	for (const { id } of referralPrograms ?? []) {
		if (
			parsed.entities.some(
				(entity) => entity.type === "referral_program" && entity.id === id,
			)
		)
			continue;
		newReferralProgramVarMap.set(
			id,
			claimVarName({
				candidate: idToVarName(`referral-program-${id}`),
				suffix: "ReferralProgram",
				usedNames: existingVarNames,
			}),
		);
	}

	const matchedFeatureIds = new Set<string>();
	const matchedPlanIds = new Set<string>();
	const matchedRewardIds = new Set<string>();
	const matchedReferralProgramIds = new Set<string>();

	const outputBlocks: string[] = [];

	let lastFeatureBlockIndex = -1;
	let lastPlanBlockIndex = -1;
	let sawFeaturesComment = false;
	let sawPlansComment = false;

	let hasAtmnImport = false;
	let lastImportBlockIndex = -1;

	for (let i = 0; i < parsed.blocks.length; i++) {
		const block = parsed.blocks[i]!;

		if (block.type === "comment") {
			const commentText = block.lines.join("\n").toLowerCase();
			if (commentText.includes("feature")) {
				sawFeaturesComment = true;
			}
			if (commentText.includes("plan")) {
				sawPlansComment = true;
			}
			outputBlocks.push(block.lines.join("\n"));
			continue;
		}

		if (block.type === "import") {
			const importText = block.lines.join("\n");
			if (/from\s+['"]atmn['"]/.test(importText)) {
				hasAtmnImport = true;
				outputBlocks.push(ensureAtmnImports(importText, requiredImports));
				lastImportBlockIndex = outputBlocks.length - 1;
				continue;
			}
			outputBlocks.push(importText);
			lastImportBlockIndex = outputBlocks.length - 1;
			continue;
		}

		if (block.type === "other") {
			outputBlocks.push(block.lines.join("\n"));
			continue;
		}

		if (block.type === "export" && block.entity) {
			const entity = block.entity;

			if (entity.type === "feature") {
				const apiFeature = apiFeatureMap.get(entity.id);
				if (apiFeature) {
					const newCode = generateFeatureCode(apiFeature, entity.varName);
					outputBlocks.push(newCode);
					matchedFeatureIds.add(entity.id);
					lastFeatureBlockIndex = outputBlocks.length - 1;
					result.featuresUpdated++;
				} else {
					result.featuresDeleted++;
				}
			} else if (entity.type === "plan") {
				const planKey = versionedCodegenId(entity);
				const apiPlan = apiPlanMap.get(planKey);
				if (apiPlan) {
					const newCode = generatePlanWithVariantsCode({
						featureVarMap,
						features,
						plan: apiPlan,
						planVarName: entity.varName,
						variantVarMap,
					});
					outputBlocks.push(newCode);
					matchedPlanIds.add(planKey);
					lastPlanBlockIndex = outputBlocks.length - 1;
					result.plansUpdated++;
				} else {
					result.plansDeleted++;
				}
			} else if (entity.type === "variant") {
				if (!apiVariantMap.has(versionedCodegenId(entity))) {
					result.plansDeleted++;
				}
			} else if (entity.type === "reward") {
				if (rewards === undefined) {
					outputBlocks.push(block.lines.join("\n"));
					continue;
				}
				const reward = apiRewardMap.get(entity.id);
				if (reward) {
					outputBlocks.push(buildRewardCode(reward, entity.varName));
					matchedRewardIds.add(entity.id);
				}
			} else if (entity.type === "referral_program") {
				if (referralPrograms === undefined) {
					outputBlocks.push(block.lines.join("\n"));
					continue;
				}
				const program = apiReferralProgramMap.get(entity.id);
				if (program) {
					outputBlocks.push(buildReferralProgramCode(program, entity.varName));
					matchedReferralProgramIds.add(entity.id);
				}
			}
			continue;
		}

		outputBlocks.push(block.lines.join("\n"));
	}

	if (!hasAtmnImport) {
		const atmnImport = buildImports({
			includeBillingControls: requiredImports.includes("billingControls"),
			includeRewards: Boolean(rewards?.length),
			includeReferralPrograms: Boolean(referralPrograms?.length),
		});
		if (lastImportBlockIndex >= 0) {
			outputBlocks.splice(lastImportBlockIndex + 1, 0, atmnImport);
			if (lastFeatureBlockIndex > lastImportBlockIndex) {
				lastFeatureBlockIndex++;
			}
			if (lastPlanBlockIndex > lastImportBlockIndex) {
				lastPlanBlockIndex++;
			}
		} else {
			outputBlocks.unshift(atmnImport);
			if (lastFeatureBlockIndex >= 0) {
				lastFeatureBlockIndex++;
			}
			if (lastPlanBlockIndex >= 0) {
				lastPlanBlockIndex++;
			}
		}
	}

	const newFeatures = features.filter((f) => !matchedFeatureIds.has(f.id));
	if (newFeatures.length > 0) {
		const newFeatureCode = newFeatures
			.map((f) => generateFeatureCode(f, newFeatureVarMap.get(f.id)))
			.join("\n\n");

		if (lastFeatureBlockIndex >= 0) {
			outputBlocks.splice(lastFeatureBlockIndex + 1, 0, newFeatureCode);
			lastFeatureBlockIndex++;
			if (lastPlanBlockIndex >= 0) {
				lastPlanBlockIndex++;
			}
		} else if (sawFeaturesComment) {
			for (let i = 0; i < outputBlocks.length; i++) {
				const blk = outputBlocks[i]!;
				if (
					blk.toLowerCase().includes("feature") &&
					(blk.trim().startsWith("//") || blk.trim().startsWith("/*"))
				) {
					outputBlocks.splice(i + 1, 0, newFeatureCode);
					lastFeatureBlockIndex = i + 1;
					if (lastPlanBlockIndex >= 0) {
						lastPlanBlockIndex++;
					}
					break;
				}
			}
		} else {
			let insertIdx = 0;
			for (let i = 0; i < outputBlocks.length; i++) {
				if (outputBlocks[i]!.trim().startsWith("import ")) {
					insertIdx = i + 1;
				}
			}
			outputBlocks.splice(insertIdx, 0, `\n// Features\n${newFeatureCode}`);
			lastFeatureBlockIndex = insertIdx;
			if (lastPlanBlockIndex >= 0) {
				lastPlanBlockIndex++;
			}
		}
		result.featuresAdded = newFeatures.length;
	}

	const newPlans = plans.filter(
		(p) => !matchedPlanIds.has(versionedCodegenId(p)),
	);
	if (newPlans.length > 0) {
		const newPlanCode = newPlans
			.map((p) =>
				generatePlanWithVariantsCode({
					featureVarMap,
					features,
					plan: p,
					planVarName: newPlanVarMap.get(versionedCodegenId(p)),
					variantVarMap,
				}),
			)
			.join("\n\n");

		if (lastPlanBlockIndex >= 0) {
			outputBlocks.splice(lastPlanBlockIndex + 1, 0, newPlanCode);
		} else if (sawPlansComment) {
			for (let i = 0; i < outputBlocks.length; i++) {
				const blk = outputBlocks[i]!;
				if (
					blk.toLowerCase().includes("plan") &&
					(blk.trim().startsWith("//") || blk.trim().startsWith("/*"))
				) {
					outputBlocks.splice(i + 1, 0, newPlanCode);
					break;
				}
			}
		} else if (lastFeatureBlockIndex >= 0) {
			outputBlocks.splice(
				lastFeatureBlockIndex + 1,
				0,
				`\n// Plans\n${newPlanCode}`,
			);
		} else {
			outputBlocks.push(`\n// Plans\n${newPlanCode}`);
		}
		result.plansAdded = newPlans.length;
	}

	const newRewards = (rewards ?? []).filter(
		({ id }) => !matchedRewardIds.has(id),
	);
	if (newRewards.length > 0) {
		outputBlocks.push(
			`\n// Rewards\n${newRewards
				.map((reward) =>
					buildRewardCode(reward, newRewardVarMap.get(reward.id)),
				)
				.join("\n\n")}`,
		);
	}

	const newReferralPrograms = (referralPrograms ?? []).filter(
		({ id }) => !matchedReferralProgramIds.has(id),
	);
	if (newReferralPrograms.length > 0) {
		outputBlocks.push(
			`\n// Referral programs\n${newReferralPrograms
				.map((program) =>
					buildReferralProgramCode(
						program,
						newReferralProgramVarMap.get(program.id),
					),
				)
				.join("\n\n")}`,
		);
	}

	const filteredBlocks = outputBlocks.filter((b) => b.trim() !== "");
	const outputLines: string[] = [];

	for (let i = 0; i < filteredBlocks.length; i++) {
		const block = filteredBlocks[i]!;
		const nextBlock = filteredBlocks[i + 1];

		outputLines.push(block);

		const isComment =
			block.trim().startsWith("//") || block.trim().startsWith("/*");
		const nextIsExport = nextBlock?.trim().startsWith("export ");

		if (i < filteredBlocks.length - 1 && !(isComment && nextIsExport)) {
			outputLines.push("");
		}
	}

	const output = `${outputLines.join("\n")}\n`;

	writeFileSync(configPath, output, "utf-8");

	return result;
}
