/**
 * atmn scenarios/versions — inline variant object, base versioned with both rows carrying real customers
 *
 * The variant is an object literal inside the plan's `variants: [...]`, never
 * a `variant({...})` fixture. Push backfills its identity into that object;
 * moving the v1 plan file to planVersions and writing pro@v2 beside it mints
 * proYearly@v2 under the new base, and the same config previews clean after.
 * A history entry that states no versionSlug still resolves to the v1 row.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CusProductStatus,
	customerProducts,
	type FullProduct,
	isFixedPrice,
} from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
	runCli,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

type CatalogPlanRow = {
	id: string;
	version: number;
	versionSlug?: string | null;
	active?: boolean | null;
	internalId?: string | null;
	variants?: Array<{
		variantPlanId: string;
		plan?: {
			version: number;
			versionSlug?: string | null;
			internalId?: string | null;
		};
	}>;
};

const PLAN_IMPORT = `import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";`;

const rootConfig = ({
	messages,
}: {
	messages: string;
}): string => `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";
import { pro } from "./plans/pro";

export default atmn({
	features: [
		feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [pro],
});
`;

/** Adds the planVersions import and entry to a root config already on disk,
 * keeping whatever push backfilled into it. */
const withHistory = (source: string): string =>
	source
		.replace(
			'import { pro } from "./plans/pro";',
			'import { pro } from "./plans/pro";\nimport { pro as proV1 } from "./planVersions/pro";',
		)
		.replace("\tplans: [pro],", "\tplans: [pro],\n\tplanVersions: [proV1],");

const proV1WithoutVariant = ({
	pro,
	messages,
}: {
	pro: string;
	messages: string;
}): string => `${PLAN_IMPORT}

export const pro = plan({
	planId: "${pro}",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [{ featureId: "${messages}", included: 100, reset: { interval: "month" } }],
});
`;

/** Step 2: the same file with an inline variant object spliced into `variants`. */
const withInlineVariant = ({
	source,
	proYearly,
	messages,
}: {
	source: string;
	proYearly: string;
	messages: string;
}): string =>
	source.replace(
		/\n\}\);\n$/,
		`
	variants: [
		{
			variantPlanId: "${proYearly}",
			name: "Pro Yearly",
			customize: {
				price: { amount: 200, interval: "year" },
				items: [{ featureId: "${messages}", included: 120, reset: { interval: "month" } }],
			},
		},
	],
});
`,
	);

const proV2 = ({
	pro,
	proYearly,
	messages,
}: {
	pro: string;
	proYearly: string;
	messages: string;
}): string => `${PLAN_IMPORT}

export const pro = plan({
	planId: "${pro}",
	versionSlug: "v2",
	name: "Pro",
	price: { amount: 25, interval: "month" },
	items: [{ featureId: "${messages}", included: 90, reset: { interval: "month" } }],
	variants: [
		{
			variantPlanId: "${proYearly}",
			name: "Pro Yearly",
			versionSlug: "v2",
			customize: {
				price: { amount: 225, interval: "year" },
				items: [{ featureId: "${messages}", included: 100, reset: { interval: "month" } }],
			},
		},
	],
});
`;

const activeCustomerProducts = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}) =>
	await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_product_id, internalProductId),
				eq(customerProducts.status, CusProductStatus.Active),
			),
		);

const productForSlug = async ({
	ctx,
	planId,
	versionSlug,
}: {
	ctx: AutumnContext;
	planId: string;
	versionSlug: string;
}): Promise<FullProduct> => {
	const rows = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	const row = rows.find((product) => product.version_slug === versionSlug);
	if (!row) throw new Error(`${planId}@${versionSlug} not found`);
	return row;
};

const shapeOf = ({
	product,
	messages,
}: {
	product: FullProduct;
	messages: string;
}) => ({
	amount: product.prices.find(isFixedPrice)?.config.amount,
	included: product.entitlements.find(
		(entitlement) => entitlement.feature.id === messages,
	)?.allowance,
});

const productAt = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) =>
	await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: planId,
		version,
	});

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: inline variant backfilled, base versioned with customers on both v1 rows, same config previews clean after")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;
		const yearlyCustomerId = uniqueTestId("atmn_cus_yearly");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([{ id: yearlyCustomerId, paymentMethod: "success" }]),
			],
			config: { raw: rootConfig({ messages }) },
			files: { "plans/pro.ts": proV1WithoutVariant({ pro, messages }) },
		});
		const ctx = scenario.ctx;
		const read = (relativePath: string): string =>
			readFileSync(join(scenario.cwd, relativePath), "utf8");

		try {
			// 1. pro@v1 alone; backfill writes internalId + versionSlug into the plan.
			await scenario.push();
			const proV1Source = read("plans/pro.ts");
			const proV1 = await productAt({ ctx, planId: pro, version: 1 });
			expect(proV1Source).toContain(`internalId: "${proV1.internal_id}"`);
			expect(proV1Source).toContain('versionSlug: "v1"');

			// 2. An inline variant object; backfill writes into that object too.
			scenario.writeFile(
				"plans/pro.ts",
				withInlineVariant({ source: proV1Source, proYearly, messages }),
			);
			const pushedVariant = await scenario.push();
			expect(pushedVariant.output).toContain(`+ ${proYearly}@v1`);
			const yearlyV1 = await productAt({ ctx, planId: proYearly, version: 1 });
			expect(yearlyV1.base_internal_product_id).toBe(proV1.internal_id);
			const afterVariant = read("plans/pro.ts");
			expect(afterVariant).toContain(
				`\t\t{\n\t\t\tinternalId: "${yearlyV1.internal_id}",\n\t\t\tvariantPlanId: "${proYearly}",`,
			);
			expect(afterVariant).toContain('\t\t\tversionSlug: "v1",\n\t\t},');
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			// 3. Real attaches: one customer on the base, one on the variant.
			await scenario.attachCustomer({ planId: pro });
			await scenario.attachCustomer({
				planId: proYearly,
				customerId: yearlyCustomerId,
			});

			// 4. v1 file moves to planVersions; plans/pro.ts becomes pro@v2.
			scenario.writeFile("planVersions/pro.ts", afterVariant);
			scenario.writeFile("plans/pro.ts", proV2({ pro, proYearly, messages }));
			scenario.writeConfig(withHistory(read("autumn.config.ts")));
			const pushedV2 = await scenario.push();
			expect(pushedV2.output).toContain(`+ ${proYearly}@v2`);
			expect(pushedV2.migrationIds).toEqual([]);

			// 5. The same config is accepted again: nothing to pull, nothing to push.
			const before = scenario.files();
			const pulled = await scenario.pull();
			expect(pulled.output).toContain("Nothing to pull.");
			expect(scenario.files()).toEqual(before);
			const dryRun = await scenario.push({ dryRun: true });
			expect(dryRun.output).toContain("No changes");
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			const catalog = (await scenario.client.get({
				include_versions: true,
			})) as unknown as { plans: CatalogPlanRow[] };
			const proRows = catalog.plans.filter((row) => row.id === pro);
			const rowAt = (version: number) =>
				proRows.find((row) => row.version === version);
			expect(rowAt(1)?.active).toBe(false);
			expect(rowAt(2)?.active).toBe(true);
			expect(rowAt(1)?.variants).toEqual([
				expect.objectContaining({
					variantPlanId: proYearly,
					plan: expect.objectContaining({ version: 1, versionSlug: "v1" }),
				}),
			]);
			expect(rowAt(2)?.variants).toEqual([
				expect.objectContaining({
					variantPlanId: proYearly,
					plan: expect.objectContaining({ version: 2, versionSlug: "v2" }),
				}),
			]);

			const proV2Row = await productAt({ ctx, planId: pro, version: 2 });
			const yearlyV2 = await productAt({ ctx, planId: proYearly, version: 2 });
			expect(yearlyV2.active).toBe(true);
			expect(yearlyV2.base_internal_product_id).toBe(proV2Row.internal_id);
			const yearlyV1After = await productAt({
				ctx,
				planId: proYearly,
				version: 1,
			});
			expect(yearlyV1After.active).toBe(false);
			expect(yearlyV1After.base_internal_product_id).toBe(proV1.internal_id);

			// Customers stay on their v1 rows.
			expect(
				await activeCustomerProducts({
					ctx,
					internalProductId: proV1.internal_id,
				}),
			).toHaveLength(1);
			expect(
				await activeCustomerProducts({
					ctx,
					internalProductId: yearlyV1.internal_id,
				}),
			).toHaveLength(1);
			expect(
				await activeCustomerProducts({
					ctx,
					internalProductId: yearlyV2.internal_id,
				}),
			).toHaveLength(0);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: a history base whose variant entry states no versionSlug resolves to the variant row anchored to it")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig({ messages }) },
			files: {
				"plans/pro.ts": withInlineVariant({
					source: proV1WithoutVariant({ pro, messages }),
					proYearly,
					messages,
				}),
			},
		});
		const ctx = scenario.ctx;
		const read = (relativePath: string): string =>
			readFileSync(join(scenario.cwd, relativePath), "utf8");

		try {
			await scenario.push();
			const proV1 = await productAt({ ctx, planId: pro, version: 1 });
			const yearlyV1 = await productAt({ ctx, planId: proYearly, version: 1 });

			// A hand-written history row: base slug stated, variant entry slug-less.
			scenario.writeFile(
				"planVersions/pro.ts",
				withInlineVariant({
					source: proV1WithoutVariant({ pro, messages }).replace(
						`planId: "${pro}",`,
						`planId: "${pro}",\n\tversionSlug: "v1",`,
					),
					proYearly,
					messages,
				}),
			);
			scenario.writeFile("plans/pro.ts", proV2({ pro, proYearly, messages }));
			scenario.writeConfig(withHistory(read("autumn.config.ts")));
			await scenario.push();
			// Push backfills the slug into the entry; strip it again so the server
			// sees the hand-written, slug-less shape.
			const historySource = read("planVersions/pro.ts");
			expect(historySource).toContain('\t\t\tversionSlug: "v1",\n\t\t},');
			scenario.writeFile(
				"planVersions/pro.ts",
				historySource.replace('\t\t\tversionSlug: "v1",\n\t\t},', "\t\t},"),
			);

			// After the push proYearly@v2 is active, yet the slug-less entry under
			// pro@v1 must still mean proYearly@v1: no conflict, no changes.
			const dryRun = await scenario.push({ dryRun: true });
			expect(dryRun.output).toContain("No changes");
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			const preview = (await scenario.preview()) as unknown as {
				plans: Array<{
					planId: string;
					version: number;
					variants?: Array<{ planId: string; version: number }>;
				}>;
			};
			const historyPreview = preview.plans.find(
				(row) => row.planId === pro && row.version === 1,
			);
			expect(historyPreview?.variants).toEqual([
				expect.objectContaining({ planId: proYearly, version: 1 }),
			]);

			const yearlyV1After = await productAt({
				ctx,
				planId: proYearly,
				version: 1,
			});
			expect(yearlyV1After.internal_id).toBe(yearlyV1.internal_id);
			expect(yearlyV1After.base_internal_product_id).toBe(proV1.internal_id);
			const proV2Row = await productAt({ ctx, planId: pro, version: 2 });
			const yearlyV2 = await productAt({ ctx, planId: proYearly, version: 2 });
			expect(yearlyV2.base_internal_product_id).toBe(proV2Row.internal_id);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: on an empty org, a slug-less history variant entry mints its own row under the history base instead of borrowing the active one")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: rootConfig({ messages }) },
			files: {
				"plans/pro.ts": withInlineVariant({
					source: proV1WithoutVariant({ pro, messages }),
					proYearly,
					messages,
				}),
			},
		});
		const ctx = scenario.ctx;
		const read = (relativePath: string): string =>
			readFileSync(join(scenario.cwd, relativePath), "utf8");
		// The CLI writes to the first .env on its search path; keep it inside cwd.
		scenario.writeFile(".env", "");

		try {
			await scenario.push();
			scenario.writeFile(
				"planVersions/pro.ts",
				withInlineVariant({
					source: proV1WithoutVariant({ pro, messages }).replace(
						`planId: "${pro}",`,
						`planId: "${pro}",\n\tversionSlug: "v1",`,
					),
					proYearly,
					messages,
				}),
			);
			scenario.writeFile("plans/pro.ts", proV2({ pro, proYearly, messages }));
			scenario.writeConfig(withHistory(read("autumn.config.ts")));
			await scenario.push();

			// Wipe, then rebuild the whole catalog from this config in one push. The
			// "v2" fixture lands first, so its rows are numbered lower: assert by slug.
			const wiped = runCli({
				cwd: scenario.cwd,
				args: ["reset", "--yes"],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
			expect(wiped).toContain("Wiped");
			const rebuilt = await scenario.push();
			expect(rebuilt.output).not.toContain("two different base rows");

			const proV1 = await productForSlug({
				ctx,
				planId: pro,
				versionSlug: "v1",
			});
			const proV2Row = await productForSlug({
				ctx,
				planId: pro,
				versionSlug: "v2",
			});
			const yearlyV1 = await productForSlug({
				ctx,
				planId: proYearly,
				versionSlug: "v1",
			});
			const yearlyV2 = await productForSlug({
				ctx,
				planId: proYearly,
				versionSlug: "v2",
			});
			expect(proV1.active).toBe(false);
			expect(proV2Row.active).toBe(true);
			expect(yearlyV1.active).toBe(false);
			expect(yearlyV2.active).toBe(true);
			expect(yearlyV1.base_internal_product_id).toBe(proV1.internal_id);
			expect(yearlyV2.base_internal_product_id).toBe(proV2Row.internal_id);
			expect(shapeOf({ product: yearlyV1, messages })).toEqual({
				amount: 200,
				included: 120,
			});
			expect(shapeOf({ product: yearlyV2, messages })).toEqual({
				amount: 225,
				included: 100,
			});

			const dryRun = await scenario.push({ dryRun: true });
			expect(dryRun.output).toContain("No changes");
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
