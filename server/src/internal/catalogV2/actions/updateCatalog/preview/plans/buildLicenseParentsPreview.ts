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
import { childPropagatesToParent } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { withCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withCatalogConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import { computeVersioningOptionsForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/versioningOptions/computeVersioningOptionsForPlan";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

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

const parentVersioningOptions = ({
	planId,
	linkedVersions,
	productStatesContext,
}: {
	planId: string;
	linkedVersions: NamedParentVersion[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const latest = productStatesContext.versionsByPlanId[planId]?.[0];
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
	directUpsert,
	upsertProducts,
	productStatesContext,
}: {
	planId: string;
	linkedVersions: NamedParentVersion[];
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioning => {
	const currentVersion =
		productStatesContext.versionsByPlanId[planId]?.[0]?.version ??
		Math.max(...linkedVersions.map((version) => version.version));
	const minted = linkedVersions.find(
		(version) => version.version > currentVersion,
	);
	const target = directUpsert.propagate?.license_parents?.find(
		(candidate) => candidate.plan_id === planId,
	);
	const parentUsesAllVersions = upsertProducts.some(
		(upsert) =>
			upsert.row.planId === planId &&
			upsert.declaredLicenses !== undefined &&
			upsert.row.versioning === "all_versions",
	);
	const resolved = minted
		? ("new_version" as const)
		: target?.versioning === "all_versions" || parentUsesAllVersions
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
	upsertProducts,
}: {
	parent: UpsertProductPlan | undefined;
	child: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
}): CatalogLicenseAction => {
	if (parent?.declaredLicenses !== undefined) return "explicit";
	if (
		parent != null &&
		childPropagatesToParent({ child, parent, upsertProducts })
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

const buildParentVersionPreview = ({
	parentUpsert,
	stateProduct,
	previewVersion,
	child,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	parentUpsert: UpsertProductPlan | undefined;
	stateProduct: FullProduct;
	previewVersion: number;
	child: UpsertProductPlan;
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
	const licenseAction = resolveLicenseAction({
		parent: parentUpsert,
		child,
		upsertProducts,
	});
	const planChange = parentPlanChange({ parentUpsert });
	const preview = {
		plan_id: stateKey.planId,
		version: previewVersion,
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
	if (licenseAction === "explicit") return preview;
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
	directUpsert,
	upsertProducts,
	productStatesContext,
}: {
	versions: NamedParentVersion[];
	directUpsert: UpsertProductPlan;
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
		const latest = planVersions.reduce((newest, version) =>
			version.version > newest.version ? version : newest,
		);
		const siblings = planVersions
			.filter((version) => version.version !== latest.version)
			.map(({ name: _name, ...sibling }) => sibling)
			.sort(byVersionAscending);

		return {
			...latest,
			versioning: parentVersioning({
				planId: latest.plan_id,
				linkedVersions: planVersions,
				directUpsert,
				upsertProducts,
				productStatesContext,
			}),
			...(siblings.length > 0 ? { sibling_versions: siblings } : {}),
		};
	});
};

/** Parents currently offering this child. Empty → omit the lane. */
export const buildLicenseParentsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogLicenseParentPreview[] => {
	const reverseLinks =
		directUpsert.row.currentFullProduct?.parent_plan_licenses ??
		directUpsert.row.baseFullProduct?.parent_plan_licenses ??
		[];
	if (reverseLinks.length === 0) return [];

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
				upsertProducts,
				productStatesContext,
				previewContext,
			});
		});
	const linkedParentPlanIds = new Set(
		existingVersions.map((version) => version.plan_id),
	);
	const mintedVersions = upsertProducts.flatMap((parentUpsert) => {
		if (!linkedParentPlanIds.has(parentUpsert.row.planId)) return [];
		const latestExisting =
			productStatesContext.versionsByPlanId[parentUpsert.row.planId]?.[0];
		if (
			!latestExisting ||
			parentUpsert.row.op !== "create" ||
			parentUpsert.row.versioning !== "new_version" ||
			parentUpsert.row.version <= latestExisting.version
		) {
			return [];
		}
		return [
			buildParentVersionPreview({
				parentUpsert,
				stateProduct: latestExisting,
				previewVersion: parentUpsert.row.version,
				child: directUpsert,
				upsertProducts,
				productStatesContext,
				previewContext,
			}),
		];
	});

	return foldParentVersions({
		versions: [...existingVersions, ...mintedVersions],
		directUpsert,
		upsertProducts,
		productStatesContext,
	}).sort(byPlanId);
};
