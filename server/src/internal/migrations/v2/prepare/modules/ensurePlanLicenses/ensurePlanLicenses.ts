import {
	type DbPlanLicense,
	EntInterval,
	type Entitlement,
	type FullProduct,
	findFeatureById,
	isOneOffProduct,
	type PlanItemFilter,
	planLicenses,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { planItemV1ToPriceAndEnt } from "@autumn/shared/api/products/items/mappers/planItemV1ToPriceAndEnt.js";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { derivePlanLicenseItemRefs } from "@/internal/licenses/actions/customize/computeLicenseCustomize.js";
import { getFullLicenseProduct } from "@/internal/licenses/licenseUtils.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { isModifyInPlaceOnly } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanOpEligibility.js";
import { toCatalogPlanFilter } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import type { PrepareModule } from "../../types/prepareModule.js";
import { hashPlanItemArtifact } from "../ensurePricesAndEntitlements/hashPlanItemArtifact.js";
import {
	licenseEntitlementIdFor,
	planLicenseIdFor,
} from "./preparedPlanLicenseIds.js";
import type {
	EnsurePlanLicensesResult,
	PreparedPlanLicenseRef,
} from "./types.js";

type LicenseItemRef = PreparedPlanLicenseRef["base_item_refs"][number];

/** Mirrors removeLicenseEntitlementRows' interval predicate so the guard sees
 * exactly the rows that deletion would drop. */
const entitlementMatchesRemovalInterval = ({
	entitlement,
	filter,
}: {
	entitlement: Entitlement;
	filter: PlanItemFilter;
}) => {
	if (filter.interval === undefined) return true;
	return (
		String(entitlement.interval ?? EntInterval.Lifetime) ===
			String(filter.interval) &&
		(entitlement.interval_count ?? 1) === (filter.interval_count ?? 1)
	);
};

/** What the batch lane cannot express about a catalog entitlement it is about to
 * drop or move. Both verbs resolve it the same way so a guard can never land on
 * one and miss the other. */
const unsupportedTraitsOf = ({
	licenseProduct,
	entitlementId,
	internalFeatureId,
	filter,
	baseItemRefs,
}: {
	licenseProduct: FullProduct;
	entitlementId?: string;
	internalFeatureId: string;
	filter?: PlanItemFilter;
	baseItemRefs: LicenseItemRef[];
}) => {
	const matched = licenseProduct.entitlements.filter((entitlement) => {
		if (entitlementId) return entitlement.id === entitlementId;
		if (entitlement.internal_feature_id !== internalFeatureId) return false;
		return filter
			? entitlementMatchesRemovalInterval({ entitlement, filter })
			: true;
	});

	return {
		matchedEntitlementIds: matched.map((entitlement) => entitlement.id),
		priced: baseItemRefs.some(
			(ref) => ref.internalFeatureId === internalFeatureId && "priceId" in ref,
		),
		entityScoped: matched.some((entitlement) =>
			Boolean(entitlement.entity_feature_id),
		),
		rollover: matched.some((entitlement) => Boolean(entitlement.rollover)),
		pooled: matched.some((entitlement) => entitlement.pooled === true),
	};
};

/** Supersession keys on feature AND interval, the identity diffPlanV1 pairs
 * items by, so an item only ever replaces one at its own interval. */
const supersessionKey = ({
	featureId,
	interval,
	intervalCount,
}: {
	featureId: string;
	interval?: string | null;
	intervalCount?: number | null;
}) => `${featureId}|${interval ?? EntInterval.Lifetime}|${intervalCount ?? 1}`;

const supersessionKeysByEntitlementId = (licenseProduct: FullProduct) =>
	new Map(
		licenseProduct.entitlements.map((entitlement) => [
			entitlement.id,
			supersessionKey({
				featureId: entitlement.feature_id ?? "",
				interval: entitlement.interval,
				intervalCount: entitlement.interval_count,
			}),
		]),
	);

const replacedEntitlementId = ({
	refs,
	matchKey,
	matchKeys,
}: {
	refs: LicenseItemRef[];
	matchKey: string;
	matchKeys: Map<string, string>;
}) =>
	refs.find(
		(ref) =>
			ref.entitlementId !== undefined &&
			matchKeys.get(ref.entitlementId) === matchKey,
	)?.entitlementId;

export type EnsurePlanLicensesInput = {
	updatePlanOps: {
		opIndex: number;
		op: UpdatePlanOp;
	}[];
};

const getMatchedParentProducts = async ({
	ctx,
	op,
}: {
	ctx: AutumnContext;
	op: UpdatePlanOp;
}) => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	return products.filter((product) =>
		planFilterMatchesProduct({
			filter: toCatalogPlanFilter(op.plan_filter),
			product,
		}),
	);
};

/** Mints one row per (op, license plan, parent product) rather than per
 * customer, so one shared entitlement fans out to every assignment. */
export const ensurePlanLicenses: PrepareModule<
	EnsurePlanLicensesInput,
	EnsurePlanLicensesResult
> = {
	kind: "ensure_plan_licenses",

	async plan({ ctx, scopeId, input }) {
		const planLicensesById = new Map<string, DbPlanLicense>();
		const entitlementsById = new Map<string, Entitlement>();
		const artifacts: PreparedPlanLicenseRef[] = [];

		for (const { opIndex, op } of input.updatePlanOps) {
			const upsertLicenses = op.customize?.upsert_licenses ?? [];
			if (upsertLicenses.length === 0) continue;

			const parentProducts = await getMatchedParentProducts({ ctx, op });

			for (const entry of upsertLicenses) {
				const addItems = entry.customize?.add_items ?? [];
				// A removal keeps the same match key as the add that supersedes it,
				// so only filters without one are standalone deletions.
				const removeFilters = (entry.customize?.remove_items ?? []).filter(
					(filter) =>
						!isModifyInPlaceOnly({
							addItems,
							removeItems: [filter],
						}),
				);
				if (addItems.length === 0 && removeFilters.length === 0) continue;

				for (const parentProduct of parentProducts) {
					const catalogLink = parentProduct.licenses?.find(
						(link) => link.product.id === entry.license_plan_id,
					);
					// The link pins a version; only an unlinked plan resolves to latest.
					const licenseProduct =
						catalogLink?.product ??
						(await getFullLicenseProduct({
							ctx,
							idOrInternalId: entry.license_plan_id,
						}));
					const baseItemRefs = derivePlanLicenseItemRefs(licenseProduct);
					const baseMatchKeys = supersessionKeysByEntitlementId(licenseProduct);
					const hash = hashJson({ value: { entry } });
					const planLicenseId = planLicenseIdFor({
						scopeId,
						opIndex,
						licensePlanId: entry.license_plan_id,
						parentInternalProductId: parentProduct.internal_id,
						hash,
					});
					const now = Date.now();

					planLicensesById.set(planLicenseId, {
						id: planLicenseId,
						parent_internal_product_id: parentProduct.internal_id,
						license_internal_product_id: licenseProduct.internal_id,
						is_custom: true,
						included: entry.included ?? catalogLink?.included ?? 1,
						prepaid_only:
							entry.prepaid_only ?? catalogLink?.prepaid_only ?? true,
						customized: true,
						metadata: entry.metadata ?? catalogLink?.metadata ?? {},
						created_at: now,
						updated_at: now,
					});

					for (const [itemIndex, item] of addItems.entries()) {
						const feature = findFeatureById({
							features: ctx.features,
							featureId: item.feature_id,
							errorOnNotFound: true,
						});
						const itemHash = hashPlanItemArtifact({ item });
						const entitlementId = licenseEntitlementIdFor({
							scopeId,
							opIndex,
							licensePlanId: entry.license_plan_id,
							itemIndex,
							internalFeatureId: feature.internal_id,
							licenseInternalProductId: licenseProduct.internal_id,
							hash: itemHash,
						});

						const { newEnt } = planItemV1ToPriceAndEnt({
							ctx,
							item,
							orgId: ctx.org.id,
							internalProductId: licenseProduct.internal_id,
							isCustom: true,
						});
						if (!newEnt) {
							throw new Error(
								`ensurePlanLicenses: no entitlement for ${item.feature_id} on ${entry.license_plan_id} — the eligibility guard should have rejected this item`,
							);
						}

						const supersededEntitlementId = replacedEntitlementId({
							refs: baseItemRefs,
							matchKey: supersessionKey({
								featureId: item.feature_id,
								interval: item.reset?.interval ?? item.price?.interval,
								intervalCount:
									item.reset?.interval_count ?? item.price?.interval_count,
							}),
							matchKeys: baseMatchKeys,
						});
						const supersededTraits = unsupportedTraitsOf({
							licenseProduct,
							entitlementId: supersededEntitlementId,
							internalFeatureId: feature.internal_id,
							baseItemRefs,
						});

						// Parent-independent by design: every parent matched by this op
						// shares one entitlement, so only the first parent mints it.
						if (!entitlementsById.has(entitlementId)) {
							entitlementsById.set(entitlementId, {
								...newEnt,
								id: entitlementId,
								internal_product_id: licenseProduct.internal_id,
							});
						}
						artifacts.push({
							op_index: opIndex,
							license_plan_id: entry.license_plan_id,
							item_index: itemIndex,
							hash: itemHash,
							parent_internal_product_id: parentProduct.internal_id,
							license_internal_product_id: licenseProduct.internal_id,
							is_one_off: isOneOffProduct({ prices: licenseProduct.prices }),
							plan_license_id: planLicenseId,
							entitlement_id: entitlementId,
							internal_feature_id: feature.internal_id,
							match_key: supersessionKey({
								featureId: item.feature_id,
								interval: item.reset?.interval ?? item.price?.interval,
								intervalCount:
									item.reset?.interval_count ?? item.price?.interval_count,
							}),
							adds_pooled_item: newEnt.pooled === true,
							replaces_entitlement_id: supersededEntitlementId,
							...(supersededEntitlementId
								? {
										removes_entity_scoped_item: supersededTraits.entityScoped,
										removes_rollover_item: supersededTraits.rollover,
									}
								: {}),
							base_item_refs: baseItemRefs,
						});
					}

					for (const filter of removeFilters) {
						const feature = ctx.features.find(
							(candidate) => candidate.id === filter.feature_id,
						);
						if (!feature) continue;

						const removedTraits = unsupportedTraitsOf({
							licenseProduct,
							internalFeatureId: feature.internal_id,
							filter,
							baseItemRefs,
						});

						artifacts.push({
							op_index: opIndex,
							license_plan_id: entry.license_plan_id,
							item_index: 0,
							hash: hashJson({ value: { filter } }),
							parent_internal_product_id: parentProduct.internal_id,
							license_internal_product_id: licenseProduct.internal_id,
							is_one_off: isOneOffProduct({ prices: licenseProduct.prices }),
							plan_license_id: planLicenseId,
							internal_feature_id: feature.internal_id,
							match_key: supersessionKey({
								featureId: filter.feature_id ?? "",
								interval: filter.interval,
								intervalCount: filter.interval_count,
							}),
							removes_filter: filter,
							removes_entitlement_ids: removedTraits.matchedEntitlementIds,
							removes_priced_item: removedTraits.priced,
							removes_entity_scoped_item: removedTraits.entityScoped,
							removes_rollover_item: removedTraits.rollover,
							removes_pooled_item: removedTraits.pooled,
							base_item_refs: baseItemRefs,
						});
					}
				}
			}
		}

		return {
			planLicenses: [...planLicensesById.values()],
			entitlements: [...entitlementsById.values()],
			artifacts,
		};
	},

	async apply({ ctx, planned }) {
		if (planned.entitlements.length > 0) {
			await EntitlementService.upsert({
				db: ctx.db,
				data: planned.entitlements,
			});
		}

		if (planned.planLicenses.length > 0) {
			await ctx.db
				.insert(planLicenses)
				.values(planned.planLicenses)
				.onConflictDoUpdate({
					target: planLicenses.id,
					set: buildConflictUpdateColumns(planLicenses, ["id"]),
				});
		}

		// replaceItems swaps the whole item set, so a base item that was superseded
		// or removed must be dropped or it is granted again on the next assignment.
		const refsByPlanLicenseId = new Map<string, Map<string, LicenseItemRef>>();
		for (const artifact of planned.artifacts) {
			const refs =
				refsByPlanLicenseId.get(artifact.plan_license_id) ??
				new Map<string, LicenseItemRef>();
			const supersededEntitlementIds = new Set(
				planned.artifacts
					.filter(
						(candidate) =>
							candidate.plan_license_id === artifact.plan_license_id,
					)
					.flatMap((candidate) => [
						...(candidate.replaces_entitlement_id
							? [candidate.replaces_entitlement_id]
							: []),
						...(candidate.removes_entitlement_ids ?? []),
					]),
			);
			for (const ref of artifact.base_item_refs) {
				if (
					ref.entitlementId &&
					supersededEntitlementIds.has(ref.entitlementId)
				)
					continue;
				refs.set(`${ref.entitlementId ?? ""}:${ref.priceId ?? ""}`, ref);
			}
			if (artifact.entitlement_id) {
				const mintedRef = { entitlementId: artifact.entitlement_id };
				refs.set(`${mintedRef.entitlementId}:`, mintedRef);
			}
			refsByPlanLicenseId.set(artifact.plan_license_id, refs);
		}
		for (const [planLicenseId, refs] of refsByPlanLicenseId) {
			await licenseItemRepo.replaceItems({
				db: ctx.db,
				planLicenseId,
				items: [...refs.values()],
			});
		}

		return planned;
	},
};
