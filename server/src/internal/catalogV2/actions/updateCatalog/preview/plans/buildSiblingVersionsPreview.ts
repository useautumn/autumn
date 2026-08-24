import type { CatalogSiblingVersionPreview, FullProduct } from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { withCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withCatalogConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byVersionAscending = (
	left: CatalogSiblingVersionPreview,
	right: CatalogSiblingVersionPreview,
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
}): CatalogSiblingVersionPreview => {
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
}): CatalogSiblingVersionPreview =>
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

/** Other existing versions of this direct entry's plan. Empty → omit the lane. */
export const buildSiblingVersionsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}): CatalogSiblingVersionPreview[] => {
	const { planId, versioning, version } = directUpsert.row;
	const hasExactlyOneDirectEntry =
		upsertProducts.filter((upsert) => isDirectForPlan({ upsert, planId }))
			.length === 1;
	if (!hasExactlyOneDirectEntry) return [];

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;

	if (versioning === "all_versions") {
		return upsertProducts
			.filter((upsert) => isAllVersionsSiblingForPlan({ upsert, planId }))
			.map((sibling) =>
				selectedSiblingFromUpsert({
					sibling,
					editedCurrent,
					editedNext,
					previewContext,
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
			return sibling
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
		})
		.sort(byVersionAscending);
};
