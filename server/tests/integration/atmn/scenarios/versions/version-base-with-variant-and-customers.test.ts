/**
 * atmn scenarios/versions — versioning a base with a nested variant, both carrying customers
 *
 * The config is the only shape the CLI can express: the new base version is a
 * second fixture in `plans` with a fresh `versionSlug`, its variant declares the
 * same fresh slug, and the old base + old variant move to `planVersions`.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	type FullProduct,
	isFixedPrice,
} from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
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
	variants?: Array<{
		variantPlanId: string;
		plan?: { id: string; version: number; versionSlug?: string | null };
	}>;
};

type VariantPreview = {
	planId: string;
	version: number;
	versionSlug?: string;
	planChange?: { previous?: unknown } | null;
};

type PlanPreview = {
	planId: string;
	version: number;
	versionSlug?: string;
	variants?: VariantPreview[];
};

const activeCustomerCount = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}): Promise<number> => {
	const rows = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_product_id, internalProductId),
				eq(customerProducts.status, CusProductStatus.Active),
			),
		);
	return rows.length;
};

type SeededCustomer = { internalCustomerId: string; cusProductId: string };

const deleteSeededCustomers = async ({
	ctx,
	seeded,
}: {
	ctx: AutumnContext;
	seeded: SeededCustomer[];
}): Promise<void> => {
	for (const { internalCustomerId, cusProductId } of seeded) {
		await ctx.db
			.delete(customerProducts)
			.where(eq(customerProducts.id, cusProductId));
		await ctx.db
			.delete(customers)
			.where(eq(customers.internal_id, internalCustomerId));
	}
};

const basePriceOf = ({
	product,
}: {
	product: FullProduct;
}): { amount: number; interval: string | null } | null => {
	const price = product.prices.find(isFixedPrice);
	if (!price) return null;
	return { amount: price.config.amount, interval: price.config.interval };
};

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

const V1_BASE = `plan({
			planId: "pro",
			versionSlug: "v1",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{
					variantPlanId: "proYearly",
					name: "Pro Yearly",
					versionSlug: "v1",
					customize: { price: { amount: 200, interval: "year" } },
				},
			],
		})`;

const V2_BASE = `plan({
			planId: "pro",
			versionSlug: "v2",
			name: "Pro",
			price: { amount: 25, interval: "month" },
			items: [{ featureId: "seats", included: 10 }],
			variants: [
				{
					variantPlanId: "proYearly",
					name: "Pro Yearly",
					versionSlug: "v2",
					customize: { price: { amount: 250, interval: "year" } },
				},
			],
		})`;

const FEATURES = `
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false }),`;

const v1OnlyConfig = `{
	features: [${FEATURES}
	],
	plans: [
		${V1_BASE},
	],
}`;

const v2WithHistoryConfig = `{
	features: [${FEATURES}
	],
	plans: [
		${V2_BASE},
	],
	planVersions: [
		${V1_BASE},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: a new base version declaring its variant under a fresh slug mints the variant version too, and both v1 rows keep their customers")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: v1OnlyConfig,
		});
		const seeded: SeededCustomer[] = [];

		try {
			await scenario.push();
			seeded.push(await scenario.seedCustomer({ planId: "pro", version: 1 }));
			seeded.push(
				await scenario.seedCustomer({ planId: "proYearly", version: 1 }),
			);

			const proV1 = await productAt({
				ctx: scenario.ctx,
				planId: "pro",
				version: 1,
			});
			const yearlyV1 = await productAt({
				ctx: scenario.ctx,
				planId: "proYearly",
				version: 1,
			});
			expect(yearlyV1.base_internal_product_id).toBe(proV1.internal_id);

			scenario.writeConfig(atmnConfigSource({ body: v2WithHistoryConfig }));

			// The preview must not 400, and must show the minted variant version as
			// a create under the new base row.
			const preview = (await scenario.preview()) as unknown as {
				plans: PlanPreview[];
			};
			const proPreviews = preview.plans.filter((plan) => plan.planId === "pro");
			const v2Preview = proPreviews.find((plan) => plan.versionSlug === "v2");
			expect(v2Preview).toBeDefined();
			const mintedVariant = v2Preview?.variants?.find(
				(variant) => variant.planId === "proYearly",
			);
			expect(mintedVariant?.version).toBe(2);
			expect(mintedVariant?.versionSlug).toBe("v2");
			expect(mintedVariant?.planChange).toBeDefined();

			const dryRun = await scenario.push({ dryRun: true });
			expect(dryRun.output).toContain("~ active: true -> false");
			expect(dryRun.output).toContain("+ proYearly@v2  $250 per year");

			await scenario.push();

			// `get` posts its body verbatim, so the request key stays snake_case.
			const catalog = (await scenario.client.get({
				include_versions: true,
				// biome-ignore lint/suspicious/noExplicitAny: the wire is the CLI's own document
			} as any)) as unknown as { plans: CatalogPlanRow[] };
			const proRows = catalog.plans.filter((plan) => plan.id === "pro");
			expect(proRows.map((row) => row.version).sort()).toEqual([1, 2]);
			// Variants surface nested under the base row they hang off.
			const nestedVariants = ({ version }: { version: number }) =>
				proRows
					.find((row) => row.version === version)
					?.variants?.map((variant) => ({
						variantPlanId: variant.variantPlanId,
						version: variant.plan?.version,
						versionSlug: variant.plan?.versionSlug,
					}));
			expect(nestedVariants({ version: 2 })).toEqual([
				{ variantPlanId: "proYearly", version: 2, versionSlug: "v2" },
			]);
			expect(nestedVariants({ version: 1 })).toEqual([
				{ variantPlanId: "proYearly", version: 1, versionSlug: "v1" },
			]);

			const proV2 = await productAt({
				ctx: scenario.ctx,
				planId: "pro",
				version: 2,
			});
			const yearlyV2 = await productAt({
				ctx: scenario.ctx,
				planId: "proYearly",
				version: 2,
			});
			expect(yearlyV2.version_slug).toBe("v2");
			expect(yearlyV2.base_internal_product_id).toBe(proV2.internal_id);
			expect(
				(
					await productAt({
						ctx: scenario.ctx,
						planId: "proYearly",
						version: 1,
					})
				).base_internal_product_id,
			).toBe(proV1.internal_id);
			expect(basePriceOf({ product: yearlyV2 })).toEqual({
				amount: 250,
				interval: "year",
			});
			expect(basePriceOf({ product: yearlyV1 })).toEqual({
				amount: 200,
				interval: "year",
			});

			// Nothing migrated: both v1 rows still carry the customer they had.
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: proV1.internal_id,
				}),
			).toBe(1);
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: yearlyV1.internal_id,
				}),
			).toBe(1);

			const settled = await scenario.push({ dryRun: true });
			expect(settled.output).toContain("No changes");
		} finally {
			// seedCustomer writes straight to the DB; scenario.cleanup() only knows
			// about the customer the scenario itself provisioned.
			await deleteSeededCustomers({ ctx: scenario.ctx, seeded });
			scenario.cleanup();
		}
	},
);
