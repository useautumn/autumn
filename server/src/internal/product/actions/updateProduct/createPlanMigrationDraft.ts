import {
	type ApiPlanV1,
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type FullProduct,
	type LicenseCustomize,
	type MigrationDraft,
	type Operations,
	type PlanFilter,
	planDiffHasBillingChanges,
	toBasePriceParams,
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

export type LicenseParentMigrationTarget = {
	planId: string;
	version: number;
	customize: LicenseCustomize | undefined;
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

type PreviousBasePrice = ReturnType<typeof toBasePriceParams> | null;

const matchedPlanIds = (matcher: PlanFilter["plan_id"]): string[] => {
	if (typeof matcher === "string") return [matcher];
	if (matcher && typeof matcher === "object" && matcher.$in) return matcher.$in;
	return [];
};

const previousPriceKey = (price: PreviousBasePrice) => JSON.stringify(price);

// Stamped onto price-change ops so the migration UI can show per-currency
// diffs after the catalog has already been updated in place. An op covering
// plans with differing previous prices is left unstamped rather than showing
// the base plan's history for a variant.
const withPreviousPrice = <T extends { operations: Operations }>({
	draft,
	previousPriceByPlanId,
}: {
	draft: T;
	previousPriceByPlanId: Map<string, PreviousBasePrice>;
}): T => ({
	...draft,
	operations: {
		...draft.operations,
		customer: draft.operations.customer?.map((op) => {
			if (op.type !== "update_plan" || op.customize?.price === undefined) {
				return op;
			}
			const prices = matchedPlanIds(op.plan_filter.plan_id).map(
				(id) => previousPriceByPlanId.get(id) ?? null,
			);
			if (prices.length === 0) return op;
			const keys = new Set(prices.map(previousPriceKey));
			if (keys.size > 1) return op;
			return {
				...op,
				customize: { ...op.customize, previous_price: prices[0] },
			};
		}),
	},
});

const buildPreviousPriceMap = ({
	planId,
	fromPlan,
	variantsBefore,
}: {
	planId: string;
	fromPlan: ApiPlanV1;
	variantsBefore: VariantMigrationSnapshot[];
}): Map<string, PreviousBasePrice> =>
	new Map([
		[planId, fromPlan.price ? toBasePriceParams(fromPlan.price) : null],
		...variantsBefore.map((before): [string, PreviousBasePrice] => [
			before.product.id,
			before.plan.price ? toBasePriceParams(before.plan.price) : null,
		]),
	]);

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

/** A parent's bill changes only if the license customize it receives carries a
 * price — the child's own diff says nothing about the parent's invoice. */
const licenseParentsHaveBillingChanges = (
	parents: LicenseParentMigrationTarget[],
) =>
	parents.some(
		(parent) =>
			parent.customize?.price != null ||
			parent.customize?.add_items?.some((item) => item.price != null),
	);

/** Parents receive the child's edit as a license customize, never as their own
 * item diff — their plan items are untouched. Identical customize values collapse
 * into one op downstream, so N parents cost one op, not N.
 *
 * Always version-scoped, including in all_versions mode: a link pins a version,
 * and two versions of one parent can carry different customizes — a bare
 * plan_id would let each op match the other's customers. */
const licenseParentTargets = ({
	planId,
	parents,
}: {
	planId: string;
	parents: LicenseParentMigrationTarget[];
}) =>
	parents
		// An entry without a customize resets the link to catalog inheritance, so
		// a parent with nothing to change must not produce a target at all.
		.filter((parent) => parent.customize !== undefined)
		.map((parent) => ({
			id: parent.planId,
			version: parent.version,
			customize: {
				upsert_licenses: [
					{ license_plan_id: planId, customize: parent.customize },
				],
			} satisfies DiffedCustomizePlanV1,
		}));

export const createPlanMigrationDraft = async ({
	ctx,
	current,
	fromPlan,
	mode,
	includeCustom = false,
	planId,
	selectedVariantIds,
	licenseParents = [],
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
	licenseParents?: LicenseParentMigrationTarget[];
	toPlan: ApiPlanV1;
	variantsBefore?: VariantMigrationSnapshot[];
}): Promise<string[]> => {
	const baseDiff = diffPlanV1({ from: fromPlan, to: toPlan });
	// Parents can need migrating even when the child's own diff is empty.
	if (Object.keys(baseDiff).length === 0 && licenseParents.length === 0) {
		return [];
	}
	const selectedVariantsBefore =
		variantsBefore.length > 0 || selectedVariantIds.length === 0
			? variantsBefore
			: await getVariantMigrationSnapshots({
					ctx,
					variantIds: selectedVariantIds,
				});

	// Sequential: the ids are returned in draft order, and the child migration
	// should exist before the parent one that follows it.
	const insertDrafts = async (drafts: (MigrationDraft | null)[]) => {
		const ids: string[] = [];
		for (const draft of drafts.filter((draft) => draft !== null)) {
			const migration = await migrationRepo.insert({
				ctx,
				insert: withPreviousPrice({
					draft,
					previousPriceByPlanId: buildPreviousPriceMap({
						planId,
						fromPlan,
						variantsBefore: selectedVariantsBefore,
					}),
				}),
			});
			ids.push(migration.id);
		}
		return ids;
	};

	// Parents move a different customer population by a different operation, so
	// they get their own migration — runnable and cancellable on its own.
	const parentDraft = buildCombinedVariantMigrationDraft({
		targets: licenseParentTargets({ planId, parents: licenseParents }),
		hasBillingChanges: licenseParentsHaveBillingChanges(licenseParents),
		includeCustom,
	});

	if (mode === "version") {
		const baseUsage = await customerProductRepo.getVersioningUsageForProduct({
			db: ctx.db,
			internalProductId: current.internal_id,
			excludeLicenseAssignments: true,
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
		return insertDrafts([
			buildCombinedVariantMigrationDraft({
				targets,
				hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
				includeCustom,
			}),
			parentDraft,
		]);
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
		excludeLicenseAssignments: true,
	});

	// Base and variants sweep every version; the parent draft stays version-
	// scoped, since a link pins the version it offers.
	const targets = [
		...(hasVersionableUsage({ products: baseVersions, usageByProduct })
			? [{ id: planId, customize: baseDiff }]
			: []),
		...selectedVariantsBefore.map((before) => ({
			id: before.product.id,
			customize: baseDiff,
		})),
	];
	return insertDrafts([
		buildAllVersionsUpdateMigrationDraft({
			targets,
			hasBillingChanges: planDiffHasBillingChanges(baseDiff, fromPlan),
			includeCustom,
		}),
		parentDraft,
	]);
};
