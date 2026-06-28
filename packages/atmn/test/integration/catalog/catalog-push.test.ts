/// <reference types="bun" />

import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import type { AttachParamsV1Input } from "@autumn/shared";
import chalk from "chalk";
import { FeatureService } from "../../../../../server/src/internal/features/FeatureService.js";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import { TestFeature } from "../../../../../server/tests/setup/v2Features.js";
import { items } from "../../../../../server/tests/utils/fixtures/items.js";
import { products } from "../../../../../server/tests/utils/fixtures/products.js";
import { timeout } from "../../../../../server/tests/utils/genUtils.js";
import {
	initScenario,
	s,
} from "../../../../../server/tests/utils/testInitUtils/initScenario.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

const replaceFirst = ({
	from,
	search,
	value,
}: {
	from: string;
	search: RegExp | string;
	value: string;
}) => {
	const updated = from.replace(search, value);
	expect(updated).not.toBe(from);
	return updated;
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const removeExportConst = ({
	config,
	name,
}: {
	config: string;
	name: string;
}) =>
	replaceFirst({
		from: config,
		search: new RegExp(
			`\\n?export const ${escapeRegExp(name)} = [\\s\\S]*?\\n\\}\\);\\n?`,
		),
		value: "\n",
	});

const replaceFeatureRefWithLiteral = ({
	config,
	featureId,
}: {
	config: string;
	featureId: string;
}) =>
	config.replace(
		new RegExp(`featureId:\\s*${escapeRegExp(featureId)}\\.id`, "g"),
		`featureId: '${featureId}'`,
	);

const replaceMessagesWithBoolean = ({ config }: { config: string }) =>
	replaceFirst({
		from: config,
		search:
			/export const messages = feature\(\{\n\tid: 'messages',\n\tname: 'Messages',\n\ttype: 'metered',\n\tconsumable: true,\n\}\);/,
		value: [
			"export const messages = feature({",
			"\tid: 'messages',",
			"\tname: 'Messages',",
			"\ttype: 'boolean',",
			"});",
		].join("\n"),
	});

const appendBatchPlan = ({
	config,
	featureId,
	planId,
}: {
	config: string;
	featureId: string;
	planId: string;
}) =>
	`${config}

export const ${featureId} = feature({
\tid: '${featureId}',
\tname: '${featureId}',
\ttype: 'metered',
\tconsumable: true,
});

export const ${planId} = plan({
\tid: '${planId}',
\tname: '${planId}',
\titems: [
\t\titem({
\t\t\tfeatureId: ${featureId}.id,
\t\t\tincluded: 123,
\t\t\treset: { interval: 'month' },
\t\t}),
\t],
});
`;

const variantPushConfig = ({
	basePlanId,
	variantPlanId,
	variantAmount,
	variantIncluded,
}: {
	basePlanId: string;
	variantPlanId: string;
	variantAmount: number;
	variantIncluded: number;
}) => `import { feature, item, plan } from 'atmn';

export const messages = feature({
\tid: 'messages',
\tname: 'Messages',
\ttype: 'metered',
\tconsumable: true,
});

export const variantPushBase = plan({
\tid: '${basePlanId}',
\tname: 'Variant Push Base',
\tprice: { amount: 20, interval: 'month' },
\titems: [
\t\titem({
\t\t\tfeatureId: messages.id,
\t\t\tincluded: 100,
\t\t\treset: { interval: 'month' },
\t\t}),
\t],
});

export const variantPushAnnual = variantPushBase.variant({
\tid: '${variantPlanId}',
\tname: 'Variant Push Annual',
\tcustomize: {
\t\tprice: { amount: ${variantAmount}, interval: 'year' },
\t\tremoveItems: [{ featureId: messages.id, interval: 'month' }],
\t\taddItems: [
\t\t\titem({
\t\t\t\tfeatureId: messages.id,
\t\t\t\tincluded: ${variantIncluded},
\t\t\t\treset: { interval: 'year' },
\t\t\t}),
\t\t],
\t},
});
`;

const inheritedVariantPushConfig = ({
	baseIncluded,
	basePlanId,
	variantPlanId,
}: {
	baseIncluded: number;
	basePlanId: string;
	variantPlanId: string;
}) => `import { feature, item, plan } from 'atmn';

export const messages = feature({
\tid: 'messages',
\tname: 'Messages',
\ttype: 'metered',
\tconsumable: true,
});

export const variantRefreshBase = plan({
\tid: '${basePlanId}',
\tname: 'Variant Refresh Base',
\titems: [
\t\titem({
\t\t\tfeatureId: messages.id,
\t\t\tincluded: ${baseIncluded},
\t\t\treset: { interval: 'month' },
\t\t}),
\t],
});

export const variantRefreshInherited = variantRefreshBase.variant({
\tid: '${variantPlanId}',
\tname: 'Variant Refresh Inherited',
});
`;

const annualVariantWithOptionalAdminConfig = ({
	baseIncluded,
	basePlanId,
	includeAdmin,
	variantPlanId,
}: {
	baseIncluded: number;
	basePlanId: string;
	includeAdmin: boolean;
	variantPlanId: string;
}) => `import { feature, item, plan } from 'atmn';

export const messages = feature({
\tid: 'messages',
\tname: 'Messages',
\ttype: 'metered',
\tconsumable: true,
});

export const adminRights = feature({
\tid: 'admin_rights',
\tname: 'Admin',
\ttype: 'boolean',
});

export const variantRefreshBase = plan({
\tid: '${basePlanId}',
\tname: 'Variant Refresh Base',
\titems: [
\t\titem({
\t\t\tfeatureId: messages.id,
\t\t\tincluded: ${baseIncluded},
\t\t\treset: { interval: 'month' },
\t\t}),
${includeAdmin ? "\t\titem({ featureId: adminRights.id }),\n" : ""}\t],
});

export const variantRefreshAnnual = variantRefreshBase.variant({
\tid: '${variantPlanId}',
\tname: 'Variant Refresh Annual',
\tcustomize: {
\t\taddItems: [
\t\t\titem({
\t\t\t\tfeatureId: messages.id,
\t\t\t\tincluded: 1400,
\t\t\t\treset: { interval: 'year' },
\t\t\t}),
\t\t],
\t\tremoveItems: [
\t\t\t{
\t\t\t\tfeatureId: messages.id,
\t\t\t\tinterval: 'month',
\t\t\t},
\t\t],
\t},
});
`;

const pullConfig = async ({
	args = ["--force", "--no-declaration-file"],
	secretKey,
}: {
	args?: string[];
	secretKey: string;
}) => {
	const workspace = await prepareAtmnIntegrationWorkspace({ secretKey });
	await runAtmnWorkspaceCli({
		args,
		command: "pull",
		headless: true,
		workspace,
	});
	return workspace;
};

const pushConfig = async (
	workspace: Awaited<ReturnType<typeof prepareAtmnIntegrationWorkspace>>,
	args = ["--yes"],
) => {
	await runAtmnWorkspaceCli({
		args,
		command: "push",
		headless: true,
		workspace,
	});
};

test(`${chalk.yellowBright("atmn catalog push: creates and updates configured variants")}`, async () => {
	const basePlanId = "atmn_variant_push_base";
	const variantPlanId = "atmn_variant_push_annual";
	const ctx = await createCleanAtmnIntegrationContext();
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});

	await writeFile(
		workspace.configPath,
		variantPushConfig({
			basePlanId,
			variantPlanId,
			variantAmount: 200,
			variantIncluded: 1200,
		}),
	);
	await pushConfig(workspace);

	const createdVariant = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
	});
	expect(createdVariant.name).toBe("Variant Push Annual");
	expect(createdVariant.base_internal_product_id).toBeTruthy();
	expect(createdVariant.prices[0]?.config).toMatchObject({
		amount: 200,
		interval: "year",
	});
	expect(
		createdVariant.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(1200);

	await writeFile(
		workspace.configPath,
		variantPushConfig({
			basePlanId,
			variantPlanId,
			variantAmount: 240,
			variantIncluded: 2400,
		}),
	);
	await pushConfig(workspace);

	const updatedVariant = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
	});
	expect(updatedVariant.version).toBe(1);
	expect(updatedVariant.prices[0]?.config).toMatchObject({
		amount: 240,
		interval: "year",
	});
	expect(
		updatedVariant.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(2400);
});

test(`${chalk.yellowBright("atmn catalog push: refreshes skipped variant diffs after base update")}`, async () => {
	const basePlanId = "atmn_variant_refresh_base";
	const variantPlanId = "atmn_variant_refresh_inherited";
	const ctx = await createCleanAtmnIntegrationContext();
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});

	await writeFile(
		workspace.configPath,
		inheritedVariantPushConfig({
			baseIncluded: 100,
			basePlanId,
			variantPlanId,
		}),
	);
	await pushConfig(workspace);

	await writeFile(
		workspace.configPath,
		inheritedVariantPushConfig({
			baseIncluded: 200,
			basePlanId,
			variantPlanId,
		}),
	);
	await pushConfig(workspace, [
		"--yes",
		"--variant-propagations",
		JSON.stringify({ [basePlanId]: [] }),
	]);

	const configAfterPush = await readFile(workspace.configPath, "utf8");
	const variantAfter = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
	});

	expect(configAfterPush).toContain("included: 200,");
	expect(configAfterPush).toContain("customize: {");
	expect(configAfterPush).toContain("included: 100,");
	expect(
		variantAfter.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(100);
});

test(`${chalk.yellowBright("atmn catalog push: refreshes skipped variant diffs when base gains boolean item")}`, async () => {
	const basePlanId = "atmn_variant_refresh_boolean_base";
	const variantPlanId = "atmn_variant_refresh_boolean_annual";
	const ctx = await createCleanAtmnIntegrationContext();
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});

	await writeFile(
		workspace.configPath,
		annualVariantWithOptionalAdminConfig({
			baseIncluded: 500,
			basePlanId,
			includeAdmin: false,
			variantPlanId,
		}),
	);
	await pushConfig(workspace);

	await writeFile(
		workspace.configPath,
		annualVariantWithOptionalAdminConfig({
			baseIncluded: 800,
			basePlanId,
			includeAdmin: true,
			variantPlanId,
		}),
	);
	await pushConfig(workspace, [
		"--yes",
		"--variant-propagations",
		JSON.stringify({ [basePlanId]: [] }),
	]);

	const configAfterPush = await readFile(workspace.configPath, "utf8");
	const variantAfter = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
	});

	expect(configAfterPush).toContain("item({ featureId: adminRights.id })");
	expect(configAfterPush.match(/featureId: adminRights\.id/g)?.length).toBe(2);
	expect(
		variantAfter.entitlements.some(
			(entitlement) => entitlement.feature.id === TestFeature.AdminRights,
		),
	).toBe(false);
});

test(`${chalk.yellowBright("atmn catalog push: missing clean plan and feature are deleted")}`, async () => {
	const planId = "atmn_catalog_clean_delete";
	const plan = products.pro({
		id: planId,
		items: [items.dashboard()],
	});
	const ctx = await createCleanAtmnIntegrationContext();

	await initScenario({
		ctx,
		setup: [s.products({ list: [plan], prefix: "" })],
		actions: [],
	});

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	const updatedConfig = removeExportConst({
		config: removeExportConst({
			config: initialConfig,
			name: planId,
		}),
		name: TestFeature.Dashboard,
	});
	await writeFile(workspace.configPath, updatedConfig);

	await pushConfig(workspace);

	const deletedPlan = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		allowNotFound: true,
	});
	const deletedFeature = await FeatureService.get({
		db: ctx.db,
		env: ctx.env,
		id: TestFeature.Dashboard,
		orgId: ctx.org.id,
	});

	expect(deletedPlan).toBeNull();
	expect(deletedFeature).toBeFalsy();
});

test(`${chalk.yellowBright("atmn catalog push: missing attached plan is archived")}`, async () => {
	const customerId = "atmn-catalog-archive-plan-customer";
	const planId = "atmn_catalog_archive_plan";
	const plan = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const ctx = await createCleanAtmnIntegrationContext();
	const { autumnV2_2 } = await initScenario({
		ctx,
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan], prefix: "" }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
	});
	await timeout(5000);

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	await writeFile(
		workspace.configPath,
		removeExportConst({ config: initialConfig, name: planId }),
	);

	await pushConfig(workspace);

	const archivedPlan = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: planId,
		orgId: ctx.org.id,
	});

	expect(archivedPlan.archived).toBe(true);
});

test(`${chalk.yellowBright("atmn catalog push: blocked feature updates are skipped")}`, async () => {
	const customerId = "atmn-catalog-blocked-feature-customer";
	const planId = "atmn_catalog_blocked_feature";
	const plan = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const ctx = await createCleanAtmnIntegrationContext();
	const { autumnV2_2 } = await initScenario({
		ctx,
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan], prefix: "" }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
	});
	await timeout(5000);

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	await writeFile(
		workspace.configPath,
		replaceMessagesWithBoolean({
			config: removeExportConst({ config: initialConfig, name: planId }),
		}),
	);

	await pushConfig(workspace);

	const messages = await FeatureService.get({
		db: ctx.db,
		env: ctx.env,
		id: TestFeature.Messages,
		orgId: ctx.org.id,
	});

	expect(messages.type).toBe("metered");
});

test(`${chalk.yellowBright("atmn catalog push: creates a new feature and plan in one batch")}`, async () => {
	const featureId = "atmn_catalog_batch_feature";
	const planId = "atmn_catalog_batch_plan";
	const ctx = await createCleanAtmnIntegrationContext();

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	await writeFile(
		workspace.configPath,
		appendBatchPlan({ config: initialConfig, featureId, planId }),
	);

	await pushConfig(workspace);

	const createdFeature = await FeatureService.get({
		db: ctx.db,
		env: ctx.env,
		id: featureId,
		orgId: ctx.org.id,
	});
	const createdPlan = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: planId,
		orgId: ctx.org.id,
	});

	expect(createdFeature.type).toBe("metered");
	expect(
		createdPlan.entitlements.some(
			(entitlement) => entitlement.feature.id === featureId,
		),
	).toBe(true);
});

test(`${chalk.yellowBright("atmn catalog push --all-versions: historical plan updates in place")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const customerId = `atmn-all-versions-push-${suffix}`;
	const planId = `atmn_all_versions_push_${suffix}`;
	const plan = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const ctx = await createCleanAtmnIntegrationContext();
	const { autumnV2_2 } = await initScenario({
		ctx,
		customerId,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: plan.name,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: "month" },
					},
				],
			},
		],
	});
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: plan.name,
				force_version: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	const workspace = await pullConfig({
		args: ["--force", "--all-versions", "--no-declaration-file"],
		secretKey: ctx.orgSecretKey,
	});
	const initialConfig = await readFile(workspace.configPath, "utf8");
	const updatedConfig = replaceFirst({
		from: initialConfig,
		search: "included: 100,",
		value: "included: 150,",
	});
	await writeFile(workspace.configPath, updatedConfig);

	await pushConfig(workspace, ["--yes", "--all-versions"]);

	const [v1, v2, latest] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			version: 1,
		}),
		ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			version: 2,
		}),
		ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: planId,
			orgId: ctx.org.id,
		}),
	]);

	expect(
		v1.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(150);
	expect(
		v2.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(200);
	expect(latest.version).toBe(2);
});

test(`${chalk.yellowBright("atmn catalog push: missing feature referenced by kept plan is archived")}`, async () => {
	const planId = "atmn_catalog_archive_feature";
	const plan = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const ctx = await createCleanAtmnIntegrationContext();

	await initScenario({
		ctx,
		setup: [s.products({ list: [plan], prefix: "" })],
		actions: [],
	});

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	const updatedConfig = replaceFeatureRefWithLiteral({
		config: removeExportConst({
			config: initialConfig,
			name: TestFeature.Messages,
		}),
		featureId: TestFeature.Messages,
	});
	await writeFile(workspace.configPath, updatedConfig);

	await pushConfig(workspace);

	const archivedFeature = await FeatureService.get({
		db: ctx.db,
		env: ctx.env,
		id: TestFeature.Messages,
		orgId: ctx.org.id,
	});

	expect(archivedFeature.archived).toBe(true);
});

test(`${chalk.yellowBright("atmn catalog push: missing credit-system child feature is archived")}`, async () => {
	const ctx = await createCleanAtmnIntegrationContext();

	const workspace = await pullConfig({ secretKey: ctx.orgSecretKey });
	const initialConfig = await readFile(workspace.configPath, "utf8");
	const updatedConfig = removeExportConst({
		config: initialConfig,
		name: TestFeature.Action1,
	});
	await writeFile(workspace.configPath, updatedConfig);

	await pushConfig(workspace);

	const archivedFeature = await FeatureService.get({
		db: ctx.db,
		env: ctx.env,
		id: TestFeature.Action1,
		orgId: ctx.org.id,
	});

	expect(archivedFeature.archived).toBe(true);
});
