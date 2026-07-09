import {
	type ApiPlanV1,
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	diffPlanV1,
	type FullProduct,
	planDiffHasBillingChanges,
	type UpdateVariantParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	validateDirectVariantMigrationDraftUnsupported,
	variantCustomizeChanged,
} from "../common/variantUpdateSource.js";

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

export const validateNoDirectVariantMigrationDrafts = ({
	hasMigrationDraft,
	variantUpdates,
	variantsBefore,
}: {
	hasMigrationDraft: boolean;
	variantUpdates: UpdateVariantParams[];
	variantsBefore: VariantMigrationSnapshot[];
}) => {
	if (!hasMigrationDraft) return;

	const beforeById = new Map(
		variantsBefore.map((snapshot) => [snapshot.product.id, snapshot]),
	);
	for (const variantUpdate of variantUpdates) {
		const before = beforeById.get(variantUpdate.variant_plan_id);
		if (!before) continue;
		validateDirectVariantMigrationDraftUnsupported({
			hasMigrationDraft: true,
			isDirect: variantCustomizeChanged({
				currentCustomize: before.plan.variant_details?.customize,
				incomingCustomize: variantUpdate.customize,
			}),
			variantPlanId: variantUpdate.variant_plan_id,
		});
	}
};

export const createPlanMigrationDraft = async ({
	ctx,
	current,
	fromPlan,
	mode,
	includeCustom = false,
	planId,
	selectedVariantIds,
	toPlan,
	variantsBefore = [],
}: {
	ctx: AutumnContext;
	current: FullProduct;
	fromPlan: ApiPlanV1;
	includeCustom?: boolean;
	mode: "all_versions" | "version";
	planId: string;
	selectedVariantIds: string[];
	toPlan: ApiPlanV1;
	variantsBefore?: VariantMigrationSnapshot[];
}): Promise<string | undefined> => {
	const baseDiff = diffPlanV1({ from: fromPlan, to: toPlan });
	if (Object.keys(baseDiff).length === 0) return;
	const selectedVariantsBefore =
		variantsBefore.length > 0 || selectedVariantIds.length === 0
			? variantsBefore
			: await getVariantMigrationSnapshots({
					ctx,
					variantIds: selectedVariantIds,
				});

	if (mode === "version") {
		const baseUsage = await customerProductRepo.getVersioningUsageForProduct({
			db: ctx.db,
			internalProductId: current.internal_id,
		});
		const targets = [
			...(baseUsage.hasVersionableCustomerProducts
				? [{ id: planId, version: current.version, customize: baseDiff }]
				: []),
			...selectedVariantsBefore.map((before) => ({
				id: before.product.id,
				version: before.product.version,
				customize: baseDiff,
			})),
		];
		const draft = buildCombinedVariantMigrationDraft({
			targets,
			hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
			includeCustom,
		});
		if (!draft) return;

		const migration = await migrationRepo.insert({ ctx, insert: draft });
		return migration.id;
	}

	const baseVersions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	const usageByProduct = await customerProductRepo.getVersioningUsage({
		db: ctx.db,
		internalProductIds: baseVersions.map((product) => product.internal_id),
	});

	const targets = [
		...(hasVersionableUsage({ products: baseVersions, usageByProduct })
			? [{ id: planId, customize: baseDiff }]
			: []),
		...selectedVariantsBefore.map((before) => ({
			id: before.product.id,
			customize: baseDiff,
		})),
	];
	const draft = buildAllVersionsUpdateMigrationDraft({
		targets,
		hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
		includeCustom,
	});
	if (!draft) return;

	const migration = await migrationRepo.insert({ ctx, insert: draft });
	return migration.id;
};
