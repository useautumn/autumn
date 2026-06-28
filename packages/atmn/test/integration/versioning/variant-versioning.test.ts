/// <reference types="bun" />

import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { type AttachParamsV1Input, customers } from "@autumn/shared";
import chalk from "chalk";
import { migrationRepo } from "../../../../../server/src/internal/migrations/v2/repos/index.js";
import { ProductService } from "../../../../../server/src/internal/products/ProductService.js";
import { generateId } from "../../../../../server/src/utils/genUtils.js";
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

let testTail = Promise.resolve();
const runSerialTest = async (fn: () => Promise<void>) => {
	const previous = testTail;
	let release: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	testTail = previous.then(() => gate);

	await previous;
	try {
		await fn();
	} finally {
		release();
	}
};

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

const multiVariantVersioningConfig = ({
	baseIncluded,
	basePlanId,
	firstVariantId,
	firstVariantIncluded,
	secondVariantId,
	secondVariantIncluded,
}: {
	baseIncluded: number;
	basePlanId: string;
	firstVariantId: string;
	firstVariantIncluded: number;
	secondVariantId: string;
	secondVariantIncluded: number;
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
\tid: '${firstVariantId}',
\tname: 'Atmn Variant Versioning Annual',
\tcustomize: {
\t\tremoveItems: [{ featureId: messages.id, interval: 'month' }],
\t\taddItems: [
\t\t\titem({
\t\t\t\tfeatureId: messages.id,
\t\t\t\tincluded: ${firstVariantIncluded},
\t\t\t\treset: { interval: 'year' },
\t\t\t}),
\t\t],
\t},
});

export const versioningEnterpriseAnnual = versioningBase.variant({
\tid: '${secondVariantId}',
\tname: 'Atmn Variant Versioning Enterprise Annual',
\tcustomize: {
\t\tremoveItems: [{ featureId: messages.id, interval: 'month' }],
\t\taddItems: [
\t\t\titem({
\t\t\t\tfeatureId: messages.id,
\t\t\t\tincluded: ${secondVariantIncluded},
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

const pushMultiVariantVersioningConfig = async ({
	baseIncluded,
	basePlanId,
	ctx,
	firstVariantId,
	firstVariantIncluded,
	planIntents,
	secondVariantId,
	secondVariantIncluded,
	variantPropagations,
}: {
	baseIncluded: number;
	basePlanId: string;
	ctx: TestContext;
	firstVariantId: string;
	firstVariantIncluded: number;
	planIntents?: Record<string, string>;
	secondVariantId: string;
	secondVariantIncluded: number;
	variantPropagations?: Record<string, string[]>;
}) => {
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});
	await writeFile(
		workspace.configPath,
		multiVariantVersioningConfig({
			baseIncluded,
			basePlanId,
			firstVariantId,
			firstVariantIncluded,
			secondVariantId,
			secondVariantIncluded,
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
	for (let attempt = 0; attempt < 10; attempt++) {
		const product = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			version,
			allowNotFound: true,
		});
		if (product) return product as FullProductResult;
		await timeout(500);
	}

	throw new Error(`Product ${planId} was not readable after push`);
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

const insertTestCustomers = async ({
	ctx,
	customerIds,
}: {
	ctx: TestContext;
	customerIds: string[];
}) => {
	if (customerIds.length === 0) return;

	await ctx.db.insert(customers).values(
		customerIds.map((customerId) => ({
			internal_id: generateId("cus"),
			org_id: ctx.org.id,
			created_at: Date.now(),
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			env: ctx.env,
			metadata: {},
			config: {},
			processors: {},
			send_email_receipts: false,
		})),
	);
	await timeout(1000);
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
	const customerKey =
		(
			{
				base_only: "bo",
				both_customers: "bc",
				update_current: "uc",
				update_current_migrate: "ucm",
				variant_only: "vo",
			} as Record<string, string>
		)[testId] ?? testId;
	const baseCustomerId = `atmn_vv_${customerKey}_base`;
	const variantCustomerId = `atmn_vv_${customerKey}_variant`;

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
	await insertTestCustomers({
		ctx,
		customerIds: [
			...(attachBaseCustomer ? [baseCustomerId] : []),
			...(attachVariantCustomer ? [variantCustomerId] : []),
		],
	});
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

test(`${chalk.yellowBright("atmn variant versioning: base customer only versions base and edits variant in place")}`, () =>
	runSerialTest(async () => {
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
			variantPropagations: { [basePlanId]: [] },
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
	}));

test(`${chalk.yellowBright("atmn variant versioning: variant customer only edits base in place and versions variant")}`, () =>
	runSerialTest(async () => {
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
			variantPropagations: { [basePlanId]: [variantPlanId] },
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
	}));

test(`${chalk.yellowBright("atmn variant versioning: base and variant customers version both plans")}`, () =>
	runSerialTest(async () => {
		const { basePlanId, baseV1, ctx, variantPlanId, variantV1 } =
			await setupAtmnVariantVersioning({
				testId: "both_customers",
				attachBaseCustomer: true,
				attachVariantCustomer: true,
			});

		await pushVariantVersioningConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			planIntents: { [basePlanId]: "create_version" },
			variantIncluded: 2400,
			variantPlanId,
			variantPropagations: { [basePlanId]: [variantPlanId] },
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
	}));

test(`${chalk.yellowBright("atmn variant versioning: update current keeps base version in place")}`, () =>
	runSerialTest(async () => {
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
			variantPropagations: { [basePlanId]: [] },
		});

		const baseAfter = await getRequiredProduct({ ctx, planId: basePlanId });
		const variantAfter = await getRequiredProduct({
			ctx,
			planId: variantPlanId,
		});
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
	}));

test(`${chalk.yellowBright("atmn variant versioning: update current and migrate creates combined draft")}`, () =>
	runSerialTest(async () => {
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
			variantPropagations: { [basePlanId]: [] },
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
	}));

test(`${chalk.yellowBright("atmn variant versioning: variant-only changes do not prompt for propagation")}`, () =>
	runSerialTest(async () => {
		const ctx = await createCleanAtmnIntegrationContext();
		const basePlanId = "atmn_variant_only_prompt_base";
		const firstVariantId = "atmn_variant_only_prompt_annual";
		const secondVariantId = "atmn_variant_only_prompt_enterprise";

		await pushMultiVariantVersioningConfig({
			baseIncluded: 100,
			basePlanId,
			ctx,
			firstVariantId,
			firstVariantIncluded: 1200,
			secondVariantId,
			secondVariantIncluded: 2400,
		});

		const baseBefore = await getRequiredProduct({ ctx, planId: basePlanId });
		const secondBefore = await getRequiredProduct({
			ctx,
			planId: secondVariantId,
		});

		await pushMultiVariantVersioningConfig({
			baseIncluded: 100,
			basePlanId,
			ctx,
			firstVariantId,
			firstVariantIncluded: 1200,
			secondVariantId,
			secondVariantIncluded: 3600,
		});

		const baseAfter = await getRequiredProduct({ ctx, planId: basePlanId });
		const secondAfter = await getRequiredProduct({
			ctx,
			planId: secondVariantId,
		});

		expect(baseAfter.internal_id).toBe(baseBefore.internal_id);
		expectMessagesAllowance({ product: baseAfter, included: 100 });
		expect(secondAfter.internal_id).toBe(secondBefore.internal_id);
		expectMessagesAllowance({ product: secondAfter, included: 3600 });
	}));

test(`${chalk.yellowBright("atmn variant versioning: multiple customer-bearing variants can be selected together")}`, () =>
	runSerialTest(async () => {
		const ctx = await createCleanAtmnIntegrationContext();
		const basePlanId = "atmn_variant_versioning_multi_base";
		const firstVariantId = "atmn_variant_versioning_multi_annual";
		const secondVariantId = "atmn_variant_versioning_multi_enterprise_annual";
		const baseCustomerId = "atmn_vv_multi_base";
		const firstVariantCustomerId = "atmn_vv_multi_annual";
		const secondVariantCustomerId = "atmn_vv_multi_enterprise";

		await pushMultiVariantVersioningConfig({
			baseIncluded: 100,
			basePlanId,
			ctx,
			firstVariantId,
			firstVariantIncluded: 1200,
			secondVariantId,
			secondVariantIncluded: 2400,
		});

		const { autumnV2_2 } = await initScenario({
			ctx,
			setup: [],
			actions: [],
		});
		await insertTestCustomers({
			ctx,
			customerIds: [
				baseCustomerId,
				firstVariantCustomerId,
				secondVariantCustomerId,
			],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: baseCustomerId,
			plan_id: basePlanId,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: firstVariantCustomerId,
			plan_id: firstVariantId,
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: secondVariantCustomerId,
			plan_id: secondVariantId,
		});
		await timeout(5000);

		const baseV1 = await getRequiredProduct({ ctx, planId: basePlanId });
		const firstVariantV1 = await getRequiredProduct({
			ctx,
			planId: firstVariantId,
		});
		const secondVariantV1 = await getRequiredProduct({
			ctx,
			planId: secondVariantId,
		});
		// return;

		await pushMultiVariantVersioningConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			firstVariantId,
			firstVariantIncluded: 1800,
			planIntents: { [basePlanId]: "create_version" },
			secondVariantId,
			secondVariantIncluded: 3600,
			variantPropagations: {
				[basePlanId]: [firstVariantId, secondVariantId],
			},
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
		const firstVariantV2 = await getRequiredProduct({
			ctx,
			planId: firstVariantId,
		});
		const secondVariantV2 = await getRequiredProduct({
			ctx,
			planId: secondVariantId,
		});

		expect(baseV2.version).toBe(2);
		expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
		expectMessagesAllowance({ product: baseV2, included: 500 });

		expect(firstVariantV2.version).toBe(2);
		expect(firstVariantV2.internal_id).not.toBe(firstVariantV1.internal_id);
		expect(firstVariantV2.base_internal_product_id).toBe(baseV2.internal_id);
		expectMessagesAllowance({ product: firstVariantV2, included: 1800 });

		expect(secondVariantV2.version).toBe(2);
		expect(secondVariantV2.internal_id).not.toBe(secondVariantV1.internal_id);
		expect(secondVariantV2.base_internal_product_id).toBe(baseV2.internal_id);
		expectMessagesAllowance({ product: secondVariantV2, included: 3600 });
	}));
