import type { CatalogSiblingVersionPreview, FullProduct } from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byVersionAscending = (
	left: CatalogSiblingVersionPreview,
	right: CatalogSiblingVersionPreview,
) => left.version - right.version;

const selectedSiblingFromUpsert = ({
	sibling,
}: {
	sibling: UpsertProductPlan;
}): CatalogSiblingVersionPreview => {
	const planChange = buildPlanChangeFromFullProducts({
		from: sibling.row.currentFullProduct ?? undefined,
		to: sibling.row.nextFullProduct,
	});

	return {
		version: sibling.row.version,
		selected: true,
		state: { has_customers: sibling.state.hasCustomers },
		...(planChange ? { plan_change: planChange } : {}),
	};
};

const unselectedSiblingFromVersion = ({
	product,
	productStatesContext,
}: {
	product: FullProduct;
	productStatesContext: ProductStatesContext;
}): CatalogSiblingVersionPreview => ({
	version: product.version,
	selected: false,
	state: {
		has_customers: productKeyToState({
			productKey: productToProductKey({ product }),
			productStatesContext,
		}).customerUsage.hasVersionableCustomerProducts,
	},
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
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): CatalogSiblingVersionPreview[] => {
	const { planId, versioning, version } = directUpsert.row;
	const hasExactlyOneDirectEntry =
		upsertProducts.filter((upsert) => isDirectForPlan({ upsert, planId }))
			.length === 1;
	if (!hasExactlyOneDirectEntry) return [];

	if (versioning === "all_versions") {
		return upsertProducts
			.filter((upsert) => isAllVersionsSiblingForPlan({ upsert, planId }))
			.map((sibling) => selectedSiblingFromUpsert({ sibling }))
			.sort(byVersionAscending);
	}

	return (productStatesContext.versionsByPlanId[planId] ?? [])
		.filter((product) => product.version !== version)
		.map((product) =>
			unselectedSiblingFromVersion({ product, productStatesContext }),
		)
		.sort(byVersionAscending);
};
