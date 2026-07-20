import {
	type ApiPlanV1,
	composeMatchKey,
	type DbPlanLicense,
	type DiffedCustomizePlanV1,
	type Entitlement,
	type Feature,
	type FullProduct,
	InternalError,
	itemsEqual,
	type Price,
	type UpdateLicenseParentParams,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import {
	applyDiffToVariantPlan,
	getApiPlanDiff,
} from "@/internal/product/actions/common/planTransformUtils.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { derivePlanLicenseItemRefs } from "./computeLicenseCustomize.js";

type PreparedLinkRebase = {
	link: DbPlanLicense;
	customize: DiffedCustomizePlanV1;
	previousEffectivePlan: ApiPlanV1;
	propagate: boolean;
};

export type PreparedCatalogPlanLicenseRebases = PreparedLinkRebase[];

export const materializeCustomerPlanLicenseSnapshots = async ({
	db,
	baseProduct,
}: {
	db: DrizzleCli;
	baseProduct: FullProduct;
}) => {
	const referenced =
		await planLicenseRepo.listCustomerReferencedByLicenseInternalProductIds({
			db,
			licenseInternalProductIds: [baseProduct.internal_id],
		});
	const items = derivePlanLicenseItemRefs(baseProduct);
	let materialized = false;
	for (const planLicense of referenced) {
		if (planLicense.customized) continue;
		await licenseItemRepo.replaceItems({
			db,
			planLicenseId: planLicense.id,
			items,
			customized: true,
		});
		materialized = true;
	}
	return materialized;
};

const productToPlan = ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}): Promise<ApiPlanV1> =>
	getPlanResponse({
		product,
		features: ctx.features,
		resolveBaseFullProduct: false,
	});

const composeEffectiveProduct = ({
	baseProduct,
	planLicenseId,
	rows,
	features,
}: {
	baseProduct: FullProduct;
	planLicenseId: string;
	rows: Awaited<ReturnType<typeof licenseItemRepo.listByPlanLicenseIds>>;
	features: Feature[];
}): FullProduct => ({
	...baseProduct,
	licenses: undefined,
	parent_plan_licenses: undefined,
	prices: rows.prices
		.filter((price) => price.plan_license_id === planLicenseId)
		.map(({ plan_license_id: _planLicenseId, ...price }) => price) as Price[],
	entitlements: getEntsWithFeature({
		ents: rows.entitlements
			.filter((entitlement) => entitlement.plan_license_id === planLicenseId)
			.map(
				({ plan_license_id: _planLicenseId, ...entitlement }) => entitlement,
			) as Entitlement[],
		features,
	}),
});

export const prepareCatalogPlanLicenseRebases = async ({
	ctx,
	db,
	baseProduct,
	propagateToParents = [],
}: {
	ctx: AutumnContext;
	db: DrizzleCli;
	baseProduct: FullProduct;
	propagateToParents?: UpdateLicenseParentParams[];
}): Promise<PreparedCatalogPlanLicenseRebases> => {
	const links = await planLicenseRepo.listCatalogByLicenseInternalProductIds({
		db,
		licenseInternalProductIds: [baseProduct.internal_id],
	});
	if (links.length === 0) return [];
	const parentByLinkId = new Map(
		(baseProduct.parent_plan_licenses ?? []).map((link) => [
			link.id,
			link.product,
		]),
	);
	const propagatedTargets = new Set(
		propagateToParents.map(({ plan_id, version }) => `${plan_id}@${version}`),
	);

	const [basePlan, rows] = await Promise.all([
		productToPlan({ ctx, product: baseProduct }),
		licenseItemRepo.listByPlanLicenseIds({
			db,
			planLicenseIds: links.map((link) => link.id),
		}),
	]);

	return Promise.all(
		links.map(async (link) => {
			const previousEffectivePlan = link.customized
				? await productToPlan({
						ctx,
						product: composeEffectiveProduct({
							baseProduct,
							planLicenseId: link.id,
							rows,
							features: ctx.features,
						}),
					})
				: basePlan;
			const parent = parentByLinkId.get(link.id);
			return {
				link,
				previousEffectivePlan,
				propagate: parent
					? propagatedTargets.has(`${parent.id}@${parent.version}`)
					: false,
				customize: getApiPlanDiff({
					from: basePlan,
					to: previousEffectivePlan,
				}),
			};
		}),
	);
};

export const applyLicenseCustomizeToBasePlan = ({
	basePlan,
	customize,
}: {
	basePlan: ApiPlanV1;
	customize: DiffedCustomizePlanV1;
}) => {
	const customizedKeys = new Set(
		(customize.add_items ?? []).map((item) => composeMatchKey(item)),
	);
	const baseWithoutCustomizedSlots = {
		...basePlan,
		items: basePlan.items.filter(
			(item) => !customizedKeys.has(composeMatchKey(item)),
		),
	};

	return applyDiffToVariantPlan({
		plan: baseWithoutCustomizedSlots,
		diff: customize,
	});
};

const hasLicenseCustomize = (customize: DiffedCustomizePlanV1) =>
	customize.price !== undefined ||
	customize.add_items !== undefined ||
	customize.remove_items !== undefined;

const resolveTargetItemRefs = ({
	targetPlan,
	previousEffectivePlan,
}: {
	targetPlan: ApiPlanV1;
	previousEffectivePlan: ApiPlanV1;
}) => {
	const refs: { entitlementId?: string; priceId?: string }[] = [];
	const previousItems = [...previousEffectivePlan.items];

	if (targetPlan.price) {
		const priceId =
			targetPlan.price.price_id ?? previousEffectivePlan.price?.price_id;
		if (!priceId) {
			throw new InternalError({
				message: "Failed to resolve license base price",
			});
		}
		refs.push({ priceId });
	}

	for (const item of targetPlan.items) {
		let entitlementId = item.entitlement_id;
		let priceId = item.price_id;
		if (!entitlementId || (item.price && !priceId)) {
			const previousIndex = previousItems.findIndex((candidate) =>
				itemsEqual(item, candidate),
			);
			if (previousIndex >= 0) {
				const [previousItem] = previousItems.splice(previousIndex, 1);
				entitlementId ??= previousItem.entitlement_id;
				priceId ??= previousItem.price_id;
			}
		}

		if (!entitlementId || (item.price && !priceId)) {
			throw new InternalError({
				message: `Failed to resolve license item ${composeMatchKey(item)}`,
			});
		}
		refs.push({ entitlementId, ...(priceId ? { priceId } : {}) });
	}

	return refs;
};

export const applyCatalogPlanLicenseRebases = async ({
	ctx,
	db,
	newBaseProduct,
	prepared,
}: {
	ctx: AutumnContext;
	db: DrizzleCli;
	newBaseProduct: FullProduct;
	prepared: PreparedCatalogPlanLicenseRebases;
}) => {
	if (prepared.length === 0) return;
	const newBasePlan = await productToPlan({ ctx, product: newBaseProduct });

	await Promise.all(
		prepared.map(
			async ({ link, customize, previousEffectivePlan, propagate }) => {
				const targetPlan = propagate
					? applyLicenseCustomizeToBasePlan({
							basePlan: newBasePlan,
							customize,
						})
					: previousEffectivePlan;
				const rebasedCustomize = getApiPlanDiff({
					from: newBasePlan,
					to: targetPlan,
				});

				if (!hasLicenseCustomize(rebasedCustomize)) {
					await licenseItemRepo.replaceItems({
						db,
						planLicenseId: link.id,
						items: [],
						customized: false,
					});
					return;
				}
				const canonicalTargetPlan = applyLicenseCustomizeToBasePlan({
					basePlan: newBasePlan,
					customize: rebasedCustomize,
				});

				await licenseItemRepo.replaceItems({
					db,
					planLicenseId: link.id,
					items: resolveTargetItemRefs({
						targetPlan: canonicalTargetPlan,
						previousEffectivePlan,
					}),
					customized: true,
				});
			},
		),
	);
};
