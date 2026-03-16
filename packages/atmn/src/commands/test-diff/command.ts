import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import createJiti from "jiti";
import type { Feature, Plan } from "../../compose/models/index.js";
import { resolveConfigPath } from "../../lib/env/index.js";
import { fetchRemoteData } from "../push/push.js";

// ── Inlined normalize helpers (mirrors push.ts exactly) ──────────────────────

type Rec = Record<string, unknown>;

function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	if (typeof a !== typeof b) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, i) => valuesEqual(item, (b as unknown[])[i]));
	}
	if (typeof a === "object" && typeof b === "object") {
		const aObj = a as Rec;
		const bObj = b as Rec;
		const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
		for (const key of allKeys) {
			if (!valuesEqual(aObj[key], bObj[key])) return false;
		}
		return true;
	}
	return false;
}

function normalizeFeatureForCompare(f: Feature): Rec {
	const result: Rec = { id: f.id, name: f.name, type: f.type };
	if (f.type === "metered" && "consumable" in f) {
		result.consumable = (f as { consumable: boolean }).consumable;
	}
	if (f.eventNames && f.eventNames.length > 0) {
		result.eventNames = [...f.eventNames].sort();
	}
	if (f.creditSchema && f.creditSchema.length > 0) {
		result.creditSchema = [...f.creditSchema]
			.sort((a, b) => a.meteredFeatureId.localeCompare(b.meteredFeatureId))
			.map((cs) => ({ meteredFeatureId: cs.meteredFeatureId, creditCost: cs.creditCost }));
	}
	return result;
}

function normalizePlanFeatureForCompare(pf: Rec): Rec {
	const result: Rec = { featureId: pf.featureId };
	if (pf.included != null && pf.included !== 0) result.included = pf.included;
	if (pf.unlimited === true) result.unlimited = true;
	const reset = pf.reset as Rec | undefined;
	if (reset != null) {
		const r: Rec = { interval: reset.interval };
		if (reset.intervalCount != null && reset.intervalCount !== 1) r.intervalCount = reset.intervalCount;
		result.reset = r;
	}
	const price = pf.price as Rec | undefined;
	if (price != null) {
		const p: Rec = {};
		if (price.amount != null) p.amount = price.amount;
		if (price.billingMethod != null) p.billingMethod = price.billingMethod;
		if (price.interval != null) p.interval = price.interval;
		if (price.intervalCount != null && price.intervalCount !== 1) p.intervalCount = price.intervalCount;
		if (price.tiers != null && Array.isArray(price.tiers) && price.tiers.length > 0) p.tiers = price.tiers;
		if (price.billingUnits != null && price.billingUnits !== 1) p.billingUnits = price.billingUnits;
		if (price.maxPurchase != null) p.maxPurchase = price.maxPurchase;
		if (Object.keys(p).length > 0) result.price = p;
	}
	const proration = pf.proration as Rec | undefined;
	if (proration != null) result.proration = proration;
	const rollover = pf.rollover as Rec | undefined;
	if (rollover != null) result.rollover = rollover;
	return result;
}

function normalizePlanForCompare(plan: Plan): Rec {
	const result: Rec = { id: plan.id, name: plan.name };
	if (plan.description != null && plan.description !== "") result.description = plan.description;
	if (plan.group != null && plan.group !== "") result.group = plan.group;
	if (plan.addOn === true) result.addOn = true;
	if (plan.autoEnable === true) result.autoEnable = true;
	if (plan.price != null) {
		result.price = { amount: plan.price.amount, interval: plan.price.interval };
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
			.map((pf) => normalizePlanFeatureForCompare(pf as unknown as Rec));
	}
	return result;
}

// ── Deep diff: returns object describing first-level key mismatches ───────────

function diffObjects(a: Rec, b: Rec, path = ""): string[] {
	const diffs: string[] = [];
	const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const key of allKeys) {
		const fullPath = path ? `${path}.${key}` : key;
		const av = a[key];
		const bv = b[key];
		if (!valuesEqual(av, bv)) {
			diffs.push(
				`  ${chalk.yellow(fullPath)}:\n` +
				`    local:  ${chalk.green(JSON.stringify(av))}\n` +
				`    remote: ${chalk.red(JSON.stringify(bv))}`,
			);
		}
	}
	return diffs;
}

// ── Config loader (same as headless.ts) ──────────────────────────────────────

async function loadLocalConfig(cwd: string): Promise<{ features: Feature[]; plans: Plan[] }> {
	const configPath = resolveConfigPath(cwd);
	if (!fs.existsSync(configPath)) {
		throw new Error(`Config file not found at ${configPath}. Run 'atmn pull' first.`);
	}
	const absolutePath = resolve(configPath);
	const fileUrl = pathToFileURL(absolutePath).href;
	const jiti = createJiti(import.meta.url);
	const mod = await jiti.import(fileUrl);

	const plans: Plan[] = [];
	const features: Feature[] = [];
	const modRecord = mod as { default?: unknown } & Record<string, unknown>;
	const defaultExport = modRecord.default as { plans?: Plan[]; features?: Feature[]; products?: Plan[] } | undefined;

	if (defaultExport?.plans && defaultExport?.features) {
		if (Array.isArray(defaultExport.plans)) plans.push(...defaultExport.plans);
		if (Array.isArray(defaultExport.features)) features.push(...defaultExport.features);
	} else if (defaultExport?.products && defaultExport?.features) {
		if (Array.isArray(defaultExport.products)) plans.push(...defaultExport.products);
		if (Array.isArray(defaultExport.features)) features.push(...defaultExport.features);
	} else {
		for (const [key, value] of Object.entries(modRecord)) {
			if (key === "default") continue;
			const obj = value as { items?: unknown; type?: unknown };
			if (obj && typeof obj === "object") {
				if ("type" in obj) features.push(obj as unknown as Feature);
				else if (Array.isArray(obj.items) || "id" in obj) plans.push(obj as unknown as Plan);
			}
		}
	}
	return { features, plans };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function testDiffCommand(): Promise<void> {
	console.log(chalk.cyan("Loading local config..."));
	const { features: localFeatures, plans: localPlans } = await loadLocalConfig(process.cwd());

	console.log(chalk.cyan("Fetching remote data..."));
	const remoteData = await fetchRemoteData();

	const remoteFeaturesById = new Map(remoteData.features.map((f) => [f.id, f]));
	const remotePlansById = new Map(remoteData.plans.map((p) => [p.id, p]));

	console.log("");
	console.log(chalk.bold("━━━ FEATURE DIFF ━━━"));

	let featureChanges = 0;
	for (const local of localFeatures) {
		const remote = remoteFeaturesById.get(local.id);
		if (!remote) {
			console.log(chalk.green(`  [NEW] ${local.id}`));
			featureChanges++;
			continue;
		}
		const localNorm = normalizeFeatureForCompare(local);
		const remoteNorm = normalizeFeatureForCompare(remote);
		if (!valuesEqual(localNorm, remoteNorm)) {
			console.log(chalk.yellow(`  [CHANGED] ${local.id}`));
			const diffs = diffObjects(localNorm, remoteNorm);
			for (const d of diffs) console.log(d);
			featureChanges++;
		}
	}
	if (featureChanges === 0) console.log(chalk.gray("  (no feature changes)"));

	console.log("");
	console.log(chalk.bold("━━━ PLAN DIFF ━━━"));

	let planChanges = 0;
	for (const local of localPlans) {
		const remote = remotePlansById.get(local.id);
		if (!remote) {
			console.log(chalk.green(`  [NEW] ${local.id}`));
			planChanges++;
			continue;
		}
		const localNorm = normalizePlanForCompare(local);
		const remoteNorm = normalizePlanForCompare(remote);
		if (!valuesEqual(localNorm, remoteNorm)) {
			console.log(chalk.yellow(`  [CHANGED] ${local.id}`));
			const diffs = diffObjects(localNorm, remoteNorm);
			for (const d of diffs) console.log(d);
			planChanges++;
		} else {
			console.log(chalk.gray(`  [same]    ${local.id}`));
		}
	}
	if (planChanges === 0) console.log(chalk.gray("  (no plan changes)"));

	console.log("");
	console.log(chalk.bold("━━━ RAW NORMALIZED (plans) ━━━"));
	for (const local of localPlans) {
		const remote = remotePlansById.get(local.id);
		if (!remote) continue;
		const localNorm = normalizePlanForCompare(local);
		const remoteNorm = normalizePlanForCompare(remote);
		console.log(chalk.cyan(`\n  [${local.id}] local:`));
		console.log(JSON.stringify(localNorm, null, 2).split("\n").map((l) => `    ${l}`).join("\n"));
		console.log(chalk.magenta(`  [${local.id}] remote:`));
		console.log(JSON.stringify(remoteNorm, null, 2).split("\n").map((l) => `    ${l}`).join("\n"));
	}
}
