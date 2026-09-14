/**
 * atmn scenarios/versions — inline variant object, base versioned with both rows carrying real customers
 *
 * The variant is an object literal inside the plan's `variants: [...]`, never
 * a `variant({...})` fixture. Push backfills its identity into that object;
 * moving the v1 plan file to planVersions and writing pro@v2 beside it mints
 * proYearly@v2 under the new base, and the same config previews clean after.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
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

/** Adds the demoted row's import and entry to a root config already on disk,
 * keeping whatever push backfilled into it: every version sits in `plans`. */
const withHistory = (source: string): string =>
	source
		.replace(
			'import { pro } from "./plans/pro";',
			'import { pro } from "./plans/pro";\nimport { pro as proV1 } from "./plans/proV1";',
		)
		.replace("\tplans: [pro],", "\tplans: [pro, proV1],");

/** The row a user demotes by hand: same file contents, `active` flipped. */
const demoted = (source: string): string =>
	source.replace("\tactive: true,", "\tactive: false,");

const proV1WithoutVariant = ({
	pro,
	messages,
}: {
	pro: string;
	messages: string;
}): string => `${PLAN_IMPORT}

export const pro = plan({
	active: true,
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
	active: true,
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

			// 4. v1 moves to its own file, demoted; plans/pro.ts becomes pro@v2.
			scenario.writeFile("plans/proV1.ts", demoted(afterVariant));
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

