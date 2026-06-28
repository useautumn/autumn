import {
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	diffPlanV1,
	planDiffHasBillingChanges,
	type ApiPlanV1,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export type VariantMigrationSnapshot = {
	product: FullProduct;
	plan: ApiPlanV1;
};

const hasVersionableUsage = ({
	products,
	usageByProduct,
}: {
	products: FullProduct[];
	usageByProduct: Awaited<
		ReturnType<typeof customerProductRepo.getVersioningUsage>
	>;
}) =>
	products.some(
		(product) =>
			usageByProduct.get(product.internal_id)?.hasVersionableCustomerProducts,
	);

const unique = (ids: string[]) => [...new Set(ids)];

export const getVariantMigrationSnapshots = async ({
	ctx,
	variantIds,
}: {
	ctx: AutumnContext;
	variantIds: string[];
}): Promise<VariantMigrationSnapshot[]> => {
	if (variantIds.length === 0) return [];

	const variants = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: unique(variantIds),
	});

	return Promise.all(
		variants.map(async (product) => ({
			product,
			plan: await getPlanResponse({
				ctx,
				product,
				features: ctx.features,
			}),
		})),
	);
};

export const createPlanMigrationDraft = async ({
	ctx,
	current,
	fromPlan,
	mode,
	planId,
	selectedVariantIds,
	toPlan,
	variantsBefore = [],
}: {
	ctx: AutumnContext;
	current: FullProduct;
	fromPlan: ApiPlanV1;
	mode: "all_versions" | "version";
	planId: string;
	selectedVariantIds: string[];
	toPlan: ApiPlanV1;
	variantsBefore?: VariantMigrationSnapshot[];
}) => {
	const baseDiff = diffPlanV1({ from: fromPlan, to: toPlan });
	if (Object.keys(baseDiff).length === 0) return;

	if (mode === "version") {
		const variants = selectedVariantIds.length
			? await ProductService.listFull({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					inIds: selectedVariantIds,
				})
			: [];
		const usageByProduct = await customerProductRepo.getVersioningUsage({
			db: ctx.db,
			internalProductIds: [
				current.internal_id,
				...variants.map((variant) => variant.internal_id),
			],
		});
		const targets = [
			...(usageByProduct.get(current.internal_id)
				?.hasVersionableCustomerProducts
				? [{ id: planId, version: current.version }]
				: []),
			...variants
				.filter(
					(variant) =>
						usageByProduct.get(variant.internal_id)
							?.hasVersionableCustomerProducts,
				)
				.map((variant) => ({
					id: variant.id,
					version: variant.version,
				})),
		];
		const draft = buildCombinedVariantMigrationDraft({
			targets,
			hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
		});
		if (!draft) return;

		await migrationRepo.insert({ ctx, insert: draft });
		return;
	}

	const baseVersions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	const variantVersions = selectedVariantIds.length
		? await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: selectedVariantIds,
				returnAll: true,
			})
		: [];
	const usageByProduct = await customerProductRepo.getVersioningUsage({
		db: ctx.db,
		internalProductIds: [
			...baseVersions.map((product) => product.internal_id),
			...variantVersions.map((product) => product.internal_id),
		],
	});
	const variantVersionsById = new Map<string, FullProduct[]>();
	for (const variant of variantVersions) {
		const versions = variantVersionsById.get(variant.id) ?? [];
		versions.push(variant);
		variantVersionsById.set(variant.id, versions);
	}

	const variantTargets = await Promise.all(
		variantsBefore.map(async (before) => {
			const versions = variantVersionsById.get(before.product.id) ?? [];
			if (!hasVersionableUsage({ products: versions, usageByProduct })) {
				return null;
			}

			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: before.product.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const afterPlan = await getPlanResponse({
				ctx,
				product: after,
				features: ctx.features,
			});

			return {
				id: before.product.id,
				customize: diffPlanV1({ from: before.plan, to: afterPlan }),
			};
		}),
	);
	const targets = [
		...(hasVersionableUsage({ products: baseVersions, usageByProduct })
			? [{ id: planId, customize: baseDiff }]
			: []),
		...variantTargets.filter((target): target is NonNullable<typeof target> =>
			Boolean(target),
		),
	];
	const draft = buildAllVersionsUpdateMigrationDraft({
		targets,
		hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
	});
	if (!draft) return;

	await migrationRepo.insert({ ctx, insert: draft });
};
