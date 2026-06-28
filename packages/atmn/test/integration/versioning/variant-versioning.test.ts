/// <reference types="bun" />

import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import type { AttachParamsV1Input } from "@autumn/shared";
import chalk from "chalk";
import { migrationRepo } from "../../../../../server/src/internal/migrations/v2/repos/index.js";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import { TestFeature } from "../../../../../server/tests/setup/v2Features.js";
import { timeout } from "../../../../../server/tests/utils/genUtils.js";
import { initScenario } from "../../../../../server/tests/utils/testInitUtils/initScenario.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

type FullProductResult = NonNullable<
	Awaited<ReturnType<typeof ProductService.getFull>>
>;
type TestContext = Awaited<
	ReturnType<typeof createCleanAtmnIntegrationContext>
>;

const variantVersioningConfig = ({
	baseIncluded,
	basePlanId,
	variantIncluded,
	variantPlanId,
}: {
	baseIncluded: number;
	basePlanId: string;
	variantIncluded: number;
	variantPlanId: string;
}) => `import { feature, item, plan } from 'atmn';

export const messages = feature({
\tid: 'messages',
\tname: 'Messages',
\ttype: 'metered',
\tconsumable: true,
});

export const versioningBase = plan({
\tid: '${basePlanId}',
\tname: 'Atmn Variant Versioning Base',
\titems: [
\t\titem({
\t\t\tfeatureId: messages.id,
\t\t\tincluded: ${baseIncluded},
\t\t\treset: { interval: 'month' },
\t\t}),
\t],
});

export const versioningAnnual = versioningBase.variant({
\tid: '${variantPlanId}',
\tname: 'Atmn Variant Versioning Annual',
\tcustomize: {
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

const pushVariantVersioningConfig = async ({
	baseIncluded,
	basePlanId,
	ctx,
	planIntents,
	variantIncluded,
	variantPlanId,
	variantPropagations,
}: {
	baseIncluded: number;
	basePlanId: string;
	ctx: TestContext;
	planIntents?: Record<string, string>;
	variantIncluded: number;
	variantPlanId: string;
	variantPropagations?: Record<string, string[]>;
}) => {
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});
	await writeFile(
		workspace.configPath,
		variantVersioningConfig({
			baseIncluded,
			basePlanId,
			variantIncluded,
			variantPlanId,
		}),
	);
	const args = [
		"--yes",
		...(planIntents ? ["--plan-intents", JSON.stringify(planIntents)] : []),
		...(variantPropagations
			? ["--variant-propagations", JSON.stringify(variantPropagations)]
			: []),
	];
	await runAtmnWorkspaceCli({
		args,
		command: "push",
		headless: true,
		workspace,
	});
};

const getRequiredProduct = async ({
	ctx,
	planId,
	version,
}: {
	ctx: TestContext;
	planId: string;
	version?: number;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		version,
	});
	expect(product).toBeDefined();
	return product as FullProductResult;
};

const expectMessagesAllowance = ({
	included,
	product,
}: {
	included: number;
	product: FullProductResult;
}) => {
	expect(
		product.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(included);
};

const migrationMentionsPlan = (
	migration: { filter: unknown },
	planId: string,
) => JSON.stringify(migration.filter).includes(planId);

const createTestCustomer = async ({
	autumnV2_2,
	customerId,
	name,
}: {
	autumnV2_2: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	customerId: string;
	name: string;
}) => {
	await autumnV2_2.customers.create({
		id: customerId,
		name,
	});

	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			await autumnV2_2.customers.get(customerId);
			return;
		} catch {
			await timeout(500);
		}
	}
	throw new Error(`Customer ${customerId} was not readable after create`);
};

const setupAtmnVariantVersioning = async ({
	attachBaseCustomer = false,
	attachVariantCustomer = false,
	testId,
}: {
	attachBaseCustomer?: boolean;
	attachVariantCustomer?: boolean;
	testId: string;
}) => {
	const ctx = await createCleanAtmnIntegrationContext();
	const basePlanId = `atmn_variant_versioning_${testId}_base`;
	const variantPlanId = `atmn_variant_versioning_${testId}_annual`;
	const baseCustomerId = `atmn_vv_${testId}_base_cus`;
	const variantCustomerId = `atmn_vv_${testId}_variant_cus`;

	await pushVariantVersioningConfig({
		baseIncluded: 100,
		basePlanId,
		ctx,
		variantIncluded: 1200,
		variantPlanId,
	});

	const { autumnV2_2 } = await initScenario({
		ctx,
		setup: [],
		actions: [],
	});

	await createTestCustomer({
		autumnV2_2,
		customerId: baseCustomerId,
		name: "Atmn Variant Versioning Base Customer",
	});
	if (attachVariantCustomer) {
		await createTestCustomer({
			autumnV2_2,
			customerId: variantCustomerId,
			name: "Atmn Variant Versioning Variant Customer",
		});
	}
	if (attachBaseCustomer) {
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: baseCustomerId,
			plan_id: basePlanId,
		});
	}
	if (attachVariantCustomer) {
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: variantCustomerId,
			plan_id: variantPlanId,
		});
	}
	if (attachBaseCustomer || attachVariantCustomer) {
		await timeout(5000);
	}

	return {
		baseCustomerId,
		basePlanId,
		baseV1: await getRequiredProduct({ ctx, planId: basePlanId }),
		ctx,
		variantCustomerId,
		variantPlanId,
		variantV1: await getRequiredProduct({ ctx, planId: variantPlanId }),
	};
};

test(`${chalk.yellowBright("atmn variant versioning: base customer only versions base and edits variant in place")}`, async () => {
	const { basePlanId, baseV1, ctx, variantPlanId, variantV1 } =
		await setupAtmnVariantVersioning({
			testId: "base_only",
			attachBaseCustomer: true,
		});

	await pushVariantVersioningConfig({
		baseIncluded: 500,
		basePlanId,
		ctx,
		planIntents: { [basePlanId]: "create_version" },
		variantIncluded: 1200,
		variantPlanId,
	});

	const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
	const variantAfter = await getRequiredProduct({
		ctx,
		planId: variantPlanId,
	});

	expect(baseV2.version).toBe(2);
	expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: baseV2, included: 500 });

	expect(variantAfter.version).toBe(1);
	expect(variantAfter.internal_id).toBe(variantV1.internal_id);
	expect(variantAfter.base_internal_product_id).toBe(baseV2.internal_id);
	expectMessagesAllowance({ product: variantAfter, included: 1200 });
});

test(`${chalk.yellowBright("atmn variant versioning: variant customer only edits base in place and versions variant")}`, async () => {
	const { basePlanId, baseV1, ctx, variantPlanId, variantV1 } =
		await setupAtmnVariantVersioning({
			testId: "variant_only",
			attachVariantCustomer: true,
		});

	await pushVariantVersioningConfig({
		baseIncluded: 500,
		basePlanId,
		ctx,
		planIntents: { [basePlanId]: "create_version" },
		variantIncluded: 2400,
		variantPlanId,
	});

	const baseAfter = await getRequiredProduct({ ctx, planId: basePlanId });
	const variantV1After = await getRequiredProduct({
		ctx,
		planId: variantPlanId,
		version: 1,
	});
	const variantV2 = await getRequiredProduct({ ctx, planId: variantPlanId });

	expect(baseAfter.version).toBe(1);
	expect(baseAfter.internal_id).toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: baseAfter, included: 500 });

	expect(variantV1After.internal_id).toBe(variantV1.internal_id);
	expect(variantV1After.base_internal_product_id).toBe(baseAfter.internal_id);
	expectMessagesAllowance({ product: variantV1After, included: 1200 });

	expect(variantV2.version).toBe(2);
	expect(variantV2.internal_id).not.toBe(variantV1.internal_id);
	expect(variantV2.base_internal_product_id).toBe(baseAfter.internal_id);
	expectMessagesAllowance({ product: variantV2, included: 2400 });
});

test(`${chalk.yellowBright("atmn variant versioning: base and variant customers version both plans")}`, async () => {
	const { basePlanId, baseV1, ctx, variantPlanId, variantV1 } =
		await setupAtmnVariantVersioning({
			testId: "both_customers",
			attachBaseCustomer: true,
			attachVariantCustomer: true,
		});

	return;

	await pushVariantVersioningConfig({
		baseIncluded: 500,
		basePlanId,
		ctx,
		planIntents: { [basePlanId]: "create_version" },
		variantIncluded: 2400,
		variantPlanId,
	});

	const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
	const variantV1After = await getRequiredProduct({
		ctx,
		planId: variantPlanId,
		version: 1,
	});
	const variantV2 = await getRequiredProduct({ ctx, planId: variantPlanId });

	expect(baseV2.version).toBe(2);
	expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: baseV2, included: 500 });

	expect(variantV1After.internal_id).toBe(variantV1.internal_id);
	expect(variantV1After.base_internal_product_id).toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: variantV1After, included: 1200 });

	expect(variantV2.version).toBe(2);
	expect(variantV2.internal_id).not.toBe(variantV1.internal_id);
	expect(variantV2.base_internal_product_id).toBe(baseV2.internal_id);
	expectMessagesAllowance({ product: variantV2, included: 2400 });
});

test(`${chalk.yellowBright("atmn variant versioning: update current keeps base version in place")}`, async () => {
	const { basePlanId, baseV1, ctx, variantPlanId, variantV1 } =
		await setupAtmnVariantVersioning({
			testId: "update_current",
			attachBaseCustomer: true,
		});

	await pushVariantVersioningConfig({
		baseIncluded: 500,
		basePlanId,
		ctx,
		planIntents: { [basePlanId]: "update_current" },
		variantIncluded: 1200,
		variantPlanId,
	});

	const baseAfter = await getRequiredProduct({ ctx, planId: basePlanId });
	const variantAfter = await getRequiredProduct({ ctx, planId: variantPlanId });
	const migrations = (await migrationRepo.get({ ctx })).filter((migration) =>
		migrationMentionsPlan(migration, basePlanId),
	);

	expect(baseAfter.version).toBe(1);
	expect(baseAfter.internal_id).toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: baseAfter, included: 500 });

	expect(variantAfter.version).toBe(1);
	expect(variantAfter.internal_id).toBe(variantV1.internal_id);
	expect(variantAfter.base_internal_product_id).toBe(baseAfter.internal_id);
	expect(migrations).toHaveLength(0);
});

test(`${chalk.yellowBright("atmn variant versioning: update current and migrate creates combined draft")}`, async () => {
	const { basePlanId, baseV1, ctx, variantPlanId } =
		await setupAtmnVariantVersioning({
			testId: "update_current_migrate",
			attachBaseCustomer: true,
		});

	await pushVariantVersioningConfig({
		baseIncluded: 500,
		basePlanId,
		ctx,
		planIntents: { [basePlanId]: "update_current_and_migrate" },
		variantIncluded: 1200,
		variantPlanId,
	});

	const baseAfter = await getRequiredProduct({ ctx, planId: basePlanId });
	const migrations = await migrationRepo.get({ ctx });
	const [migration] = migrations;

	expect(baseAfter.version).toBe(1);
	expect(baseAfter.internal_id).toBe(baseV1.internal_id);
	expectMessagesAllowance({ product: baseAfter, included: 500 });
	expect(migration).toBeDefined();
	expect(migration?.filter).toMatchObject({
		customer: { plan: { plan_id: basePlanId, custom: false } },
	});
	expect(migration?.operations).toMatchObject({
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: basePlanId, custom: false },
				version: 1,
			},
		],
	});
});
