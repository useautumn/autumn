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

const allVersionsConfig = ({
	baseIncluded,
	basePlanId,
	includeAdmin = false,
	variantIncluded,
	variantPlanId,
}: {
	baseIncluded: number;
	basePlanId: string;
	includeAdmin?: boolean;
	variantIncluded: number;
	variantPlanId: string;
}) => `import { feature, item, plan } from 'atmn';

export const messages = feature({
\tid: 'messages',
\tname: 'Messages',
\ttype: 'metered',
\tconsumable: true,
});
${includeAdmin ? `
export const adminRights = feature({
\tid: 'admin_rights',
\tname: 'Admin Rights',
\ttype: 'boolean',
});
` : ""}

export const allVersionsBase = plan({
\tid: '${basePlanId}',
\tname: 'Atmn All Versions Base',
\titems: [
\t\titem({
\t\t\tfeatureId: messages.id,
\t\t\tincluded: ${baseIncluded},
\t\t\treset: { interval: 'month' },
\t\t}),
\t\t${includeAdmin ? "item({ featureId: adminRights.id })," : ""}
\t],
});

export const allVersionsAnnual = allVersionsBase.variant({
\tid: '${variantPlanId}',
\tname: 'Atmn All Versions Annual',
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

const pushAllVersionsConfig = async ({
	baseIncluded,
	basePlanId,
	ctx,
	includeAdmin,
	migrationDrafts,
	planIntents,
	variantIncluded,
	variantPlanId,
	variantPropagations,
}: {
	baseIncluded: number;
	basePlanId: string;
	ctx: TestContext;
	includeAdmin?: boolean;
	migrationDrafts?: Record<string, boolean>;
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
		allVersionsConfig({
			baseIncluded,
			basePlanId,
			includeAdmin,
			variantIncluded,
			variantPlanId,
		}),
	);
	await runAtmnWorkspaceCli({
		args: [
			"--yes",
			...(migrationDrafts
				? ["--migration-drafts", JSON.stringify(migrationDrafts)]
				: []),
			...(planIntents ? ["--plan-intents", JSON.stringify(planIntents)] : []),
			...(variantPropagations
				? ["--variant-propagations", JSON.stringify(variantPropagations)]
				: []),
		],
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

	throw new Error(`Product ${planId} v${version ?? "latest"} was not readable`);
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

const insertCustomers = async ({
	ctx,
	customerIds,
}: {
	ctx: TestContext;
	customerIds: string[];
}) => {
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

const setupTwoVersions = async ({
	testId,
}: {
	testId: string;
}) => {
	const ctx = await createCleanAtmnIntegrationContext();
	const basePlanId = `atmn_allvers_${testId}_base`;
	const variantPlanId = `atmn_allvers_${testId}_annual`;
	const baseV1CustomerId = `atmn_allvers_${testId}_base_v1`;
	const variantV1CustomerId = `atmn_allvers_${testId}_variant_v1`;
	const baseV2CustomerId = `atmn_allvers_${testId}_base_v2`;
	const variantV2CustomerId = `atmn_allvers_${testId}_variant_v2`;

	await pushAllVersionsConfig({
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
	await insertCustomers({
		ctx,
		customerIds: [baseV1CustomerId, variantV1CustomerId],
	});
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: baseV1CustomerId,
		plan_id: basePlanId,
	});
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: variantV1CustomerId,
		plan_id: variantPlanId,
	});
	await timeout(5000);

		await pushAllVersionsConfig({
			baseIncluded: 200,
			basePlanId,
			ctx,
			planIntents: {
				[basePlanId]: "create_version",
				[variantPlanId]: "create_version",
			},
			variantIncluded: 1400,
			variantPlanId,
			variantPropagations: { [basePlanId]: [variantPlanId] },
	});

	await insertCustomers({
		ctx,
		customerIds: [baseV2CustomerId, variantV2CustomerId],
	});
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: baseV2CustomerId,
		plan_id: basePlanId,
	});
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: variantV2CustomerId,
		plan_id: variantPlanId,
	});
	await timeout(5000);

	return { basePlanId, ctx, variantPlanId };
};

test(`${chalk.yellowBright("atmn all versions: updates selected base and variant versions with draft")}`, () =>
	runSerialTest(async () => {
		const { basePlanId, ctx, variantPlanId } = await setupTwoVersions({
			testId: "selected",
		});

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			migrationDrafts: { [basePlanId]: true, [variantPlanId]: true },
			planIntents: {
				[basePlanId]: "update_all_versions",
				[variantPlanId]: "update_current",
			},
			variantIncluded: 1800,
			variantPlanId,
			variantPropagations: { [basePlanId]: [variantPlanId] },
		});

		const baseV1 = await getRequiredProduct({
			ctx,
			planId: basePlanId,
			version: 1,
		});
		const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
			const variantV1 = await getRequiredProduct({
				ctx,
				planId: variantPlanId,
				version: 1,
			});
			const variantV2 = await getRequiredProduct({ ctx, planId: variantPlanId });
			const migrations = await migrationRepo.get({ ctx });

			expect(baseV2.version).toBe(2);
			expect(variantV2.version).toBe(2);
			expectMessagesAllowance({ product: baseV1, included: 500 });
			expectMessagesAllowance({ product: baseV2, included: 500 });
			expectMessagesAllowance({ product: variantV1, included: 1800 });
			expectMessagesAllowance({ product: variantV2, included: 1800 });
			const [migration] = migrations;
			expect(migrations).toHaveLength(1);
			expect(migration?.filter).toMatchObject({
				customer: { plan: { plan_id: { $in: [basePlanId, variantPlanId] } } },
			});
			expect(migration?.operations).toMatchObject({
				customer: expect.arrayContaining([
					expect.objectContaining({
						type: "update_plan",
						plan_filter: { plan_id: basePlanId, custom: false },
					}),
					expect.objectContaining({
						type: "update_plan",
						plan_filter: { plan_id: variantPlanId, custom: false },
					}),
				]),
			});
		}));

test(`${chalk.yellowBright("atmn all versions: skipped variant versions remain unchanged")}`, () =>
	runSerialTest(async () => {
		const { basePlanId, ctx, variantPlanId } = await setupTwoVersions({
			testId: "skipped",
		});

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			migrationDrafts: { [basePlanId]: true },
			planIntents: {
				[basePlanId]: "update_all_versions",
				[variantPlanId]: "skip",
			},
			variantIncluded: 1800,
			variantPlanId,
			variantPropagations: { [basePlanId]: [] },
		});

		const baseV1 = await getRequiredProduct({
			ctx,
			planId: basePlanId,
			version: 1,
		});
		const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
		const variantV1 = await getRequiredProduct({
			ctx,
			planId: variantPlanId,
			version: 1,
		});
		const variantV2 = await getRequiredProduct({ ctx, planId: variantPlanId });
		const [migration] = await migrationRepo.get({ ctx });

		expect(baseV2.version).toBe(2);
		expect(variantV2.version).toBe(2);
		expectMessagesAllowance({ product: baseV1, included: 500 });
		expectMessagesAllowance({ product: baseV2, included: 500 });
		expectMessagesAllowance({ product: variantV1, included: 1200 });
		expectMessagesAllowance({ product: variantV2, included: 1400 });
		expect(migration?.filter).toMatchObject({
			customer: { plan: { plan_id: basePlanId, custom: false } },
		});
		expect(migration?.operations).toMatchObject({
			customer: [
				expect.objectContaining({
					type: "update_plan",
					plan_filter: { plan_id: basePlanId, custom: false },
				}),
			],
		});
	}));

test(`${chalk.yellowBright("atmn all versions: can update without migration draft")}`, () =>
	runSerialTest(async () => {
		const { basePlanId, ctx, variantPlanId } = await setupTwoVersions({
			testId: "no_migration",
		});

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			migrationDrafts: { [basePlanId]: false, [variantPlanId]: false },
			planIntents: {
				[basePlanId]: "update_all_versions",
				[variantPlanId]: "update_current",
			},
			variantIncluded: 1800,
			variantPlanId,
			variantPropagations: { [basePlanId]: [variantPlanId] },
		});

		const baseV1 = await getRequiredProduct({
			ctx,
			planId: basePlanId,
			version: 1,
		});
		const baseV2 = await getRequiredProduct({ ctx, planId: basePlanId });
		const variantV1 = await getRequiredProduct({
			ctx,
			planId: variantPlanId,
			version: 1,
		});
		const variantV2 = await getRequiredProduct({ ctx, planId: variantPlanId });
		const migrations = await migrationRepo.get({ ctx });

		expect(baseV2.version).toBe(2);
		expect(variantV2.version).toBe(2);
		expectMessagesAllowance({ product: baseV1, included: 500 });
		expectMessagesAllowance({ product: baseV2, included: 500 });
		expectMessagesAllowance({ product: variantV1, included: 1800 });
		expectMessagesAllowance({ product: variantV2, included: 1800 });
		expect(migrations).toHaveLength(0);

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			variantIncluded: 1800,
			variantPlanId,
		});
	}));

test(`${chalk.yellowBright("atmn all versions: base feature add stays idempotent after variant propagation")}`, () =>
	runSerialTest(async () => {
		const { basePlanId, ctx, variantPlanId } = await setupTwoVersions({
			testId: "feature_add",
		});

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			includeAdmin: true,
			migrationDrafts: { [basePlanId]: false, [variantPlanId]: false },
			planIntents: {
				[basePlanId]: "update_all_versions",
				[variantPlanId]: "update_current",
			},
			variantIncluded: 1800,
			variantPlanId,
			variantPropagations: { [basePlanId]: [variantPlanId] },
		});

		await pushAllVersionsConfig({
			baseIncluded: 500,
			basePlanId,
			ctx,
			includeAdmin: true,
			variantIncluded: 1800,
			variantPlanId,
		});
	}));
