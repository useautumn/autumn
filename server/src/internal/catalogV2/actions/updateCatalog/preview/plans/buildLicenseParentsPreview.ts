import type {
	CatalogLicenseAction,
	CatalogLicenseParentPreview,
	FullProduct,
} from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { childPropagatesToParent } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { withCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withCatalogConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byPlanThenVersion = (
	left: CatalogLicenseParentPreview,
	right: CatalogLicenseParentPreview,
) => left.plan_id.localeCompare(right.plan_id) || left.version - right.version;

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
		(upsert) =>
			upsert.row.planId === planId && upsert.row.version === version,
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
	parentProduct?.licenses?.find(
		(license) => license.product.id === childPlanId,
	)?.product;

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

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;

	return reverseLinks
		.filter((link) => !link.product.archived)
		.map((link) => {
			const parentKey = productToProductKey({ product: link.product });
			const parentUpsert = findParentUpsert({
				upsertProducts,
				planId: parentKey.planId,
				version: parentKey.version,
			});
			const parentState = productKeyToState({
				productKey: parentKey,
				productStatesContext,
			});
			const parentProduct =
				parentUpsert?.row.currentFullProduct ??
				parentState.currentFullProduct ??
				link.product;
			const licenseAction = resolveLicenseAction({
				parent: parentUpsert,
				child: directUpsert,
				upsertProducts,
			});
			const planChange = parentPlanChange({ parentUpsert });
			const preview = {
				plan_id: parentKey.planId,
				version: parentKey.version,
				name: parentProduct.name,
				state: {
					has_customers:
						parentState.customerUsage.hasVersionableCustomerProducts,
					will_archive: false,
					usage: customerUsageForPreview({
						planId: parentKey.planId,
						version: parentKey.version,
						previewContext,
					}),
				},
				license_action: licenseAction,
				...(planChange ? { plan_change: planChange } : {}),
			};
			// Declared licenses[] took the slot — child-edit conflicts are not listed.
			if (licenseAction === "explicit") return preview;
			return withCatalogConflicts({
				preview,
				current: editedCurrent,
				next: editedNext,
				relative: effectiveChildForParent({
					parentProduct,
					childPlanId: directUpsert.row.planId,
				}),
			});
		})
		.sort(byPlanThenVersion);
};
