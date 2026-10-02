import type {
	CatalogLicenseAction,
	CatalogLicenseParentPreview,
	CatalogLicenseParentVersionPreview,
	CatalogPlanVersioning,
	CatalogPlanVersioningStrategy,
	FullProduct,
} from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import {
	childEditsItemsInPlace,
	childPropagatesToParent,
	movesActivePointer,
	reverseLinksOnChildPlan,
	reverseLinksOnChildProduct,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { withCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withCatalogConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import { computeVersioningOptionsForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/versioningOptions/computeVersioningOptionsForPlan";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";

const byPlanId = (
	left: CatalogLicenseParentPreview,
	right: CatalogLicenseParentPreview,
) => left.plan_id.localeCompare(right.plan_id);

const byVersionAscending = (
	left: CatalogLicenseParentVersionPreview,
	right: CatalogLicenseParentVersionPreview,
) => left.version - right.version;

/** A parent version plus the plan name, which only the top-level entry keeps. */
type NamedParentVersion = CatalogLicenseParentVersionPreview & { name: string };

type ReverseChildLink = {
	license_internal_product_id: string;
	product: FullProduct;
};

const parentVersioningOptions = ({
	planId,
	linkedVersions,
	productStatesContext,
}: {
	planId: string;
	linkedVersions: NamedParentVersion[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const latest = activeFullProductForPlan({ planId, productStatesContext });
	const latestLinked = linkedVersions.some(
		(version) => version.version === latest?.version,
	);
	let hasCustomers = false;
	if (latest && latestLinked) {
		const latestState = productKeyToState({
			productKey: productToProductKey({ product: latest }),
			productStatesContext,
		});
		hasCustomers = latestState.customerUsage.hasVersionableCustomerProducts;
	}
	return computeVersioningOptionsForPlan({
		hasCustomers,
		isLatestVersion: latestLinked,
		hasMultipleVersions: linkedVersions.length > 1,
	});
};

const parentVersioning = ({
	planId,
	linkedVersions,
	upsertProducts,
	productStatesContext,
}: {
	planId: string;
	linkedVersions: NamedParentVersion[];
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioning => {
	const currentVersion =
		maxVersionForPlan({ planId, productStatesContext }) ||
		Math.max(...linkedVersions.map((version) => version.version));
	const minted = linkedVersions.find(
		(version) => version.version > currentVersion,
	);
	const parentUsesAllVersions = upsertProducts.some(
		(upsert) =>
			upsert.row.planId === planId &&
			upsert.declaredLicenses !== undefined &&
			upsert.row.versioning === "all_versions",
	);
	const resolved = minted
		? ("new_version" as const)
		: parentUsesAllVersions
			? ("all_versions" as const)
			: ("existing" as const);

	return {
		current_version: currentVersion,
		new_version: minted?.version ?? null,
		resolved,
		options: parentVersioningOptions({
			planId,
			linkedVersions: linkedVersions.filter(
				(version) => version.version <= currentVersion,
			),
			productStatesContext,
		}),
	};
};

const findParentUpsert = ({
	upsertProducts,
	planId,
	version,
}: {
	upsertProducts: UpsertProductPlan[];
	planId: string;
	version: number;
}): UpsertProductPlan | undefined =>
	upsertProducts.find(
		(upsert) => upsert.row.planId === planId && upsert.row.version === version,
	);

const resolveLicenseAction = ({
	parent,
	child,
	productStatesContext,
}: {
	parent: UpsertProductPlan | undefined;
	child: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): CatalogLicenseAction => {
	if (parent?.declaredLicenses !== undefined) return "explicit";
	if (
		parent != null &&
		childPropagatesToParent({ child, parent, productStatesContext })
	) {
		return "propagated";
	}
	return "unchanged";
};

const effectiveChildForParent = ({
	parentProduct,
	childPlanId,
}: {
	parentProduct: FullProduct | null;
	childPlanId: string;
}) =>
	parentProduct?.licenses?.find((license) => license.product.id === childPlanId)
		?.product;

const parentPlanChange = ({
	parentUpsert,
}: {
	parentUpsert: UpsertProductPlan | undefined;
}) =>
	parentUpsert
		? buildPlanChangeFromFullProducts({
				from:
					parentUpsert.row.baseFullProduct ??
					parentUpsert.row.currentFullProduct ??
					undefined,
				to: parentUpsert.row.nextFullProduct,
			})
		: undefined;

/** This child edit will rewrite the catalog link (in-place on this row, or mint/promote). */
const childEditRewritesLink = ({
	link,
	child,
}: {
	link: ReverseChildLink | undefined;
	child: UpsertProductPlan;
}): boolean => {
	if (movesActivePointer({ upsert: child })) return true;
	if (!childEditsItemsInPlace({ child })) return false;
	if (!link) return false;
	return link.license_internal_product_id === child.row.nextFullProduct.internal_id;
};

const buildParentVersionPreview = ({
	parentUpsert,
	stateProduct,
	previewVersion,
	child,
	link,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	parentUpsert: UpsertProductPlan | undefined;
	stateProduct: FullProduct;
	previewVersion: number;
	child: UpsertProductPlan;
	link?: ReverseChildLink;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}): NamedParentVersion => {
	const stateKey = productToProductKey({ product: stateProduct });
	const parentState = productKeyToState({
		productKey: stateKey,
		productStatesContext,
	});
	const parentProduct =
		parentUpsert?.row.currentFullProduct ??
		parentUpsert?.row.baseFullProduct ??
		parentState.currentFullProduct ??
		stateProduct;
	const licenseAction = childEditRewritesLink({ link, child })
		? resolveLicenseAction({
				parent: parentUpsert,
				child,
				productStatesContext,
			})
		: ("unchanged" as const);
	const planChange = parentPlanChange({ parentUpsert });
	const preview = {
		...catalogRowIdentity({
			planId: stateKey.planId,
			version: previewVersion,
			current:
				parentUpsert?.row.op === "create"
					? null
					: (parentUpsert?.row.currentFullProduct ?? parentProduct),
			next: parentUpsert?.row.nextFullProduct ?? parentProduct,
		}),
		name: parentProduct.name,
		state: {
			has_customers: parentState.customerUsage.hasVersionableCustomerProducts,
			will_archive: false,
			usage: customerUsageForPreview({
				planId: stateKey.planId,
				version: stateKey.version,
				previewContext,
			}),
		},
		license_action: licenseAction,
		...(planChange ? { plan_change: planChange } : {}),
	};
	if (
		licenseAction === "explicit" ||
		!childEditRewritesLink({ link, child })
	) {
		return preview;
	}
	return withCatalogConflicts({
		preview,
		current: child.row.currentFullProduct,
		next: child.row.nextFullProduct,
		relative: effectiveChildForParent({
			parentProduct,
			childPlanId: child.row.planId,
		}),
	});
};

/** Collapse the per-version rows of one parent plan into a single lane entry. */
const foldParentVersions = ({
	versions,
	upsertProducts,
	productStatesContext,
}: {
	versions: NamedParentVersion[];
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): CatalogLicenseParentPreview[] => {
	const versionsByPlanId = new Map<string, NamedParentVersion[]>();
	for (const version of versions) {
		versionsByPlanId.set(version.plan_id, [
			...(versionsByPlanId.get(version.plan_id) ?? []),
			version,
		]);
	}

	return [...versionsByPlanId.values()].map((planVersions) => {
		const activeVersion = activeVersionForPlan({
			planId: planVersions[0]!.plan_id,
			productStatesContext,
		});
		const active =
			planVersions.find((version) => version.version === activeVersion) ??
			planVersions.reduce((newest, version) =>
				version.version > newest.version ? version : newest,
			);
		const siblings = planVersions
			.filter((version) => version.version !== active.version)
			.map(({ name: _name, ...sibling }) => sibling)
			.sort(byVersionAscending);
		const minted = planVersions.find(
			(version) => version.version > (activeVersion ?? active.version),
		);

		return {
			...active,
			...(minted?.plan_change && !active.plan_change
				? { plan_change: minted.plan_change }
				: {}),
			versioning: parentVersioning({
				planId: active.plan_id,
				linkedVersions: planVersions,
				upsertProducts,
				productStatesContext,
			}),
			...(siblings.length > 0 ? { sibling_versions: siblings } : {}),
		};
	});
};

/** Parents whose planLicense points at this child version row. Empty → omit. */
export const buildLicenseParentsPreview = ({
	directUpsert,
	childInternalId,
	includeMintedParents = true,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	directUpsert: UpsertProductPlan;
	childInternalId?: string;
	includeMintedParents?: boolean;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogLicenseParentPreview[] => {
	const scopedInternalId =
		childInternalId ?? directUpsert.row.nextFullProduct.internal_id;
	const reverseLinks = reverseLinksOnChildProduct({
		planId: directUpsert.row.planId,
		childInternalId: scopedInternalId,
		productStatesContext,
	});

	const existingVersions = reverseLinks
		.filter((link) => !link.product.archived)
		.map((link): NamedParentVersion => {
			const parentKey = productToProductKey({ product: link.product });
			const parentUpsert = findParentUpsert({
				upsertProducts,
				planId: parentKey.planId,
				version: parentKey.version,
			});
			return buildParentVersionPreview({
				parentUpsert,
				stateProduct: link.product,
				previewVersion: parentKey.version,
				child: directUpsert,
				link,
				upsertProducts,
				productStatesContext,
				previewContext,
			});
		});
	if (!includeMintedParents) {
		return foldParentVersions({
			versions: existingVersions,
			upsertProducts,
			productStatesContext,
		}).sort(byPlanId);
	}

	const sourceInternalId =
		directUpsert.row.currentFullProduct?.internal_id ??
		directUpsert.row.baseFullProduct?.internal_id;
	const followingFromSource =
		sourceInternalId &&
		sourceInternalId !== scopedInternalId &&
		movesActivePointer({ upsert: directUpsert })
			? reverseLinksOnChildProduct({
					planId: directUpsert.row.planId,
					childInternalId: sourceInternalId,
					productStatesContext,
				})
					.filter((link) => !link.product.archived)
					.flatMap((link): NamedParentVersion[] => {
						const parentKey = productToProductKey({ product: link.product });
						const parentUpsert = findParentUpsert({
							upsertProducts,
							planId: parentKey.planId,
							version: parentKey.version,
						});
						const listedForPropagate = (
							directUpsert.propagate?.license_parents ?? []
						).some((target) => target.plan_id === parentKey.planId);
						if (
							!listedForPropagate &&
							resolveLicenseAction({
								parent: parentUpsert,
								child: directUpsert,
								productStatesContext,
							}) === "unchanged"
						) {
							return [];
						}
						return [
							buildParentVersionPreview({
								parentUpsert,
								stateProduct: link.product,
								previewVersion: parentKey.version,
								child: directUpsert,
								link,
								upsertProducts,
								productStatesContext,
								previewContext,
							}),
						];
					})
			: [];

	const linkedParentPlanIds = new Set(
		reverseLinksOnChildPlan({
			planId: directUpsert.row.planId,
			productStatesContext,
		}).map((link) => productToProductKey({ product: link.product }).planId),
	);
	const mintedVersions = upsertProducts.flatMap((parentUpsert) => {
		if (!linkedParentPlanIds.has(parentUpsert.row.planId)) return [];
		if (parentUpsert.row.source !== "license_adopt") return [];
		const maxVersion = maxVersionForPlan({
			planId: parentUpsert.row.planId,
			productStatesContext,
		});
		const active = activeFullProductForPlan({
			planId: parentUpsert.row.planId,
			productStatesContext,
		});
		if (
			!active ||
			parentUpsert.row.op !== "create" ||
			parentUpsert.row.versioning !== "new_version" ||
			parentUpsert.row.version <= maxVersion
		) {
			return [];
		}
		return [
			buildParentVersionPreview({
				parentUpsert,
				stateProduct: active,
				previewVersion: parentUpsert.row.version,
				child: directUpsert,
				upsertProducts,
				productStatesContext,
				previewContext,
			}),
		];
	});

	return foldParentVersions({
		versions: [...existingVersions, ...followingFromSource, ...mintedVersions],
		upsertProducts,
		productStatesContext,
	}).sort(byPlanId);
};
