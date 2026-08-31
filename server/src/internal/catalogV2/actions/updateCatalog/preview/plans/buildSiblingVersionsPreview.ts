import type {
	CatalogPlanSiblingVersionPreview,
	FullProduct,
} from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildLicenseParentsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildLicenseParentsPreview";
import { buildVariantsPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildVariantsPreview";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { withCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withCatalogConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byVersionAscending = (
	left: CatalogPlanSiblingVersionPreview,
	right: CatalogPlanSiblingVersionPreview,
) => left.version - right.version;

const selectedSiblingFromUpsert = ({
	sibling,
	editedCurrent,
	editedNext,
	previewContext,
}: {
	sibling: UpsertProductPlan;
	editedCurrent: FullProduct | null;
	editedNext: FullProduct;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogPlanSiblingVersionPreview => {
	const planChange = buildPlanChangeFromFullProducts({
		from: sibling.row.currentFullProduct ?? undefined,
		to: sibling.row.nextFullProduct,
	});

	return withCatalogConflicts({
		preview: {
			...catalogRowIdentity({
				planId: sibling.row.planId,
				version: sibling.row.version,
				current: sibling.row.currentFullProduct,
				next: sibling.row.nextFullProduct,
			}),
			state: {
				has_customers: sibling.state.hasCustomers,
				will_archive: false,
				usage: customerUsageForPreview({
					planId: sibling.row.planId,
					version: sibling.row.version,
					previewContext,
				}),
			},
			...(planChange ? { plan_change: planChange } : {}),
		},
		current: editedCurrent,
		next: editedNext,
		relative: sibling.row.currentFullProduct,
	});
};

const unselectedSiblingFromVersion = ({
	product,
	productStatesContext,
	editedCurrent,
	editedNext,
	previewContext,
}: {
	product: FullProduct;
	productStatesContext: ProductStatesContext;
	editedCurrent: FullProduct | null;
	editedNext: FullProduct;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogPlanSiblingVersionPreview =>
	withCatalogConflicts({
		preview: {
			...catalogRowIdentity({
				planId: product.id,
				version: product.version,
				current: product,
				next: product,
			}),
			state: {
				has_customers: productKeyToState({
					productKey: productToProductKey({ product }),
					productStatesContext,
				}).customerUsage.hasVersionableCustomerProducts,
				will_archive: false,
				usage: customerUsageForPreview({
					planId: product.id,
					version: product.version,
					previewContext,
				}),
			},
		},
		current: editedCurrent,
		next: editedNext,
		relative: product,
	});

const isDirectForPlan = ({
	upsert,
	planId,
}: {
	upsert: UpsertProductPlan;
	planId: string;
}) => upsert.row.source === "direct" && upsert.row.planId === planId;

const isAllVersionsSiblingForPlan = ({
	upsert,
	planId,
}: {
	upsert: UpsertProductPlan;
	planId: string;
}) => upsert.row.source === "all_versions" && upsert.row.planId === planId;

const withSiblingLicenseParents = ({
	sibling,
	childInternalId,
	childUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	sibling: CatalogPlanSiblingVersionPreview;
	childInternalId: string;
	childUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogPlanSiblingVersionPreview => {
	const licenseParents = buildLicenseParentsPreview({
		directUpsert: childUpsert,
		childInternalId,
		includeMintedParents: false,
		upsertProducts,
		productStatesContext,
		previewContext,
	});
	return {
		...sibling,
		...(licenseParents.length > 0 ? { license_parents: licenseParents } : {}),
	};
};

/** No-op upsert so variant preview can resolve anchors on an unselected row. */
const existingRowUpsert = ({
	product,
	productStatesContext,
}: {
	product: FullProduct;
	productStatesContext: ProductStatesContext;
}): UpsertProductPlan => ({
	row: {
		planId: product.id,
		version: product.version,
		op: "none",
		source: "direct",
		versioning: "existing",
		currentFullProduct: product,
		baseFullProduct: null,
		nextFullProduct: product,
	},
	state: {
		hasCustomers: productKeyToState({
			productKey: productToProductKey({ product }),
			productStatesContext,
		}).customerUsage.hasVersionableCustomerProducts,
		planHadLiveVersions: true,
	},
});

const withSiblingVariants = ({
	sibling,
	baseUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
	renamePlans,
}: {
	sibling: CatalogPlanSiblingVersionPreview;
	baseUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	renamePlans: RenameProductPlan[];
}): CatalogPlanSiblingVersionPreview => {
	const variants = buildVariantsPreview({
		directUpsert: baseUpsert,
		upsertProducts,
		productStatesContext,
		previewContext,
		renamePlans,
	});
	return {
		...sibling,
		...(variants.length > 0 ? { variants } : {}),
	};
};

/** Other existing versions of this direct entry's plan. Empty → omit the lane. */
export const buildSiblingVersionsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
	renamePlans,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	renamePlans: RenameProductPlan[];
}): CatalogPlanSiblingVersionPreview[] => {
	const { planId, versioning, version } = directUpsert.row;
	const hasExactlyOneDirectEntry =
		upsertProducts.filter((upsert) => isDirectForPlan({ upsert, planId }))
			.length === 1;
	if (!hasExactlyOneDirectEntry) return [];

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;
	const attachParents = ({
		sibling,
		childInternalId,
		childUpsert,
	}: {
		sibling: CatalogPlanSiblingVersionPreview;
		childInternalId: string;
		childUpsert: UpsertProductPlan;
	}) =>
		withSiblingLicenseParents({
			sibling,
			childInternalId,
			childUpsert,
			upsertProducts,
			productStatesContext,
			previewContext,
		});

	const attachVariants = ({
		siblingPreview,
		baseUpsert,
	}: {
		siblingPreview: CatalogPlanSiblingVersionPreview;
		baseUpsert: UpsertProductPlan;
	}) =>
		withSiblingVariants({
			sibling: siblingPreview,
			baseUpsert,
			upsertProducts,
			productStatesContext,
			previewContext,
			renamePlans,
		});

	if (versioning === "all_versions") {
		return upsertProducts
			.filter((upsert) => isAllVersionsSiblingForPlan({ upsert, planId }))
			.map((sibling) =>
				attachVariants({
					siblingPreview: attachParents({
						sibling: selectedSiblingFromUpsert({
							sibling,
							editedCurrent,
							editedNext,
							previewContext,
						}),
						childInternalId: sibling.row.nextFullProduct.internal_id,
						childUpsert: sibling,
					}),
					baseUpsert: sibling,
				}),
			)
			.sort(byVersionAscending);
	}

	return (productStatesContext.versionsByPlanId[planId] ?? [])
		.filter((product) => product.version !== version)
		.map((product) => {
			const sibling = upsertProducts.find(
				(upsert) =>
					upsert.row.planId === product.id &&
					upsert.row.version === product.version,
			);
			const preview = sibling
				? selectedSiblingFromUpsert({
						sibling,
						editedCurrent,
						editedNext,
						previewContext,
					})
				: unselectedSiblingFromVersion({
						product,
						productStatesContext,
						editedCurrent,
						editedNext,
						previewContext,
					});
			return attachVariants({
				siblingPreview: attachParents({
					sibling: preview,
					childInternalId: sibling
						? sibling.row.nextFullProduct.internal_id
						: product.internal_id,
					childUpsert: sibling ?? directUpsert,
				}),
				baseUpsert:
					sibling ?? existingRowUpsert({ product, productStatesContext }),
			});
		})
		.sort(byVersionAscending);
};
