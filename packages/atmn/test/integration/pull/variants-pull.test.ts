/// <reference types="bun" />

import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
	ApiVersion,
	type ApiPlanV1,
	BillingInterval,
	type CreatePlanParamsV2Input,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import chalk from "chalk";
import createJiti from "jiti";
import { AutumnRpcCli } from "../../../../../server/src/external/autumn/autumnRpcCli.js";
import { FeatureService } from "../../../../../server/src/internal/features/FeatureService.js";
import {
	constructBooleanFeature,
	constructMeteredFeature,
} from "../../../../../server/src/internal/features/utils/constructFeatureUtils.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const pullConfig = async ({
	args = ["--force", "--no-declaration-file"],
	reset = true,
	secretKey,
}: {
	args?: string[];
	reset?: boolean;
	secretKey: string;
}) => {
	const workspace = await prepareAtmnIntegrationWorkspace({ reset, secretKey });
	await runAtmnWorkspaceCli({
		args,
		command: "pull",
		headless: true,
		workspace,
	});
	return workspace;
};

const loadConfigModule = async (configPath: string) => {
	const jiti = createJiti(import.meta.url);
	return (await jiti.import(pathToFileURL(configPath).href)) as Record<
		string,
		unknown
	>;
};

test(`${chalk.yellowBright("atmn pull variants: method exports, boolean items, camelCase names")}`, async () => {
	const ctx = await createCleanAtmnIntegrationContext();
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	await FeatureService.insert({
		db: ctx.db,
		logger: console,
		data: [
			constructBooleanFeature({
				env: ctx.env,
				featureId: "engagement_tracking",
				orgId: ctx.org.id,
			}),
			constructBooleanFeature({
				env: ctx.env,
				featureId: "inbound_routing",
				orgId: ctx.org.id,
			}),
			constructMeteredFeature({
				env: ctx.env,
				featureId: "automation_runs",
				orgId: ctx.org.id,
				usageType: FeatureUsageType.Single,
			}),
		],
	});

	await rpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: "100k-pro",
		name: "100k Pro",
		price: { amount: 49, interval: BillingInterval.Month },
		items: [
			{ feature_id: "engagement_tracking" },
			{ feature_id: "inbound_routing" },
			{
				feature_id: "automation_runs",
				included: 100_000,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	await rpc.post("/plans.create_variant", {
		base_plan_id: "100k-pro",
		variant_plan_id: "100k-pro-annual",
		name: "100k Pro Annual",
	});
	await rpc.plans.update<ApiPlanV1>("100k-pro-annual", {
		price: { amount: 500, interval: BillingInterval.Year },
		items: [
			{ feature_id: "engagement_tracking" },
			{ feature_id: "inbound_routing" },
			{
				feature_id: "automation_runs",
				included: 1_200_000,
				reset: { interval: ResetInterval.Year },
			},
		],
		disable_version: true,
	});

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const config = await readFile(workspace.configPath, "utf8");
	const mod = await loadConfigModule(workspace.configPath);
	const basePlan = mod.plan100kPro as {
		id: string;
		variants?: unknown[];
	};
	const variant = mod.plan100kProAnnual as {
		__atmnType?: string;
		customize?: {
			addItems?: unknown[];
			price?: unknown;
			removeItems?: unknown[];
		};
	};

	expect(config).toContain("import { feature, item, plan } from 'atmn';");
	expect(config).not.toContain(" variant ");
	expect(config).toContain("export const engagementTracking = feature(");
	expect(config).toContain("export const inboundRouting = feature(");
	expect(config).toContain("export const automationRuns = feature(");
	expect(config).toContain("export const plan100kPro = plan(");
	expect(config).toContain(
		"export const plan100kProAnnual = plan100kPro.variant({",
	);
	expect(config).toContain("item({ featureId: engagementTracking.id }),");
	expect(config).toContain("item({ featureId: inboundRouting.id }),");
	expect(config).not.toMatch(
		/featureId: engagementTracking\.id,[\s\S]*?included: 0/,
	);
	expect(config).not.toMatch(
		/featureId: inboundRouting\.id,[\s\S]*?included: 0/,
	);
	expect(config).toContain("removeItems: [");
	expect(config).not.toContain("itemFilter(");
	expect(config).toContain("addItems: [");

	expect(basePlan.id).toBe("100k-pro");
	expect(basePlan.variants).toHaveLength(1);
	expect(variant.__atmnType).toBe("variant");
	expect(variant.customize?.price).toEqual({
		amount: 500,
		interval: BillingInterval.Year,
	});
	expect(variant.customize?.removeItems).toEqual([
		{
			featureId: "automation_runs",
			interval: BillingInterval.Month,
		},
	]);
	expect(variant.customize?.addItems).toEqual([
		{
			featureId: "automation_runs",
			included: 1_200_000,
			reset: { interval: ResetInterval.Year },
		},
	]);

	await rpc.plans.update<ApiPlanV1>("100k-pro-annual", {
		price: { amount: 510, interval: BillingInterval.Year },
		disable_version: true,
	});

	await pullConfig({
		args: ["--no-declaration-file"],
		reset: false,
		secretKey: ctx.orgSecretKey,
	});
	const inPlaceConfig = await readFile(workspace.configPath, "utf8");
	const variantExportPattern =
		/export const plan100kProAnnual = plan100kPro\.variant/g;

	expect(inPlaceConfig.match(variantExportPattern)).toHaveLength(1);
	expect(inPlaceConfig).toContain("price: { amount: 510, interval: 'year' }");
});

test(`${chalk.yellowBright("atmn pull variants: variable names handle collisions and numeric prefixes")}`, async () => {
	const ctx = await createCleanAtmnIntegrationContext();
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	await FeatureService.insert({
		db: ctx.db,
		logger: console,
		data: [
			constructBooleanFeature({
				env: ctx.env,
				featureId: "pro_annual",
				orgId: ctx.org.id,
			}),
			constructBooleanFeature({
				env: ctx.env,
				featureId: "2fa",
				orgId: ctx.org.id,
			}),
		],
	});

	await rpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: "pro",
		name: "Pro",
		items: [{ feature_id: "2fa" }],
	});
	await rpc.post("/plans.create_variant", {
		base_plan_id: "pro",
		variant_plan_id: "pro_annual",
		name: "Pro Annual",
	});

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const config = await readFile(workspace.configPath, "utf8");

	expect(config).toContain("export const proAnnual = feature(");
	expect(config).toContain("export const feature2fa = feature(");
	expect(config).toContain("item({ featureId: feature2fa.id })");
	expect(config).toContain("export const pro = plan(");
	expect(config).toContain("export const proAnnualVariant = pro.variant({");
});
