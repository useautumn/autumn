import {
	type CatalogPlanVersioningStrategy,
	type FullProduct,
	productToProductKey,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";
import { computeVersioningOptionsForPlan } from "./computeVersioningOptionsForPlan";
import { parentLicensePlanIds } from "./parentLicensePlanIds";

const addUnique = ({
	options,
	add,
}: {
	options: CatalogPlanVersioningStrategy[];
	add: CatalogPlanVersioningStrategy[];
}): void => {
	for (const option of add) {
		if (!options.includes(option)) options.push(option);
	}
};

const computeVersioningOptionsForPlanId = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const versions = productStatesContext.versionsByPlanId[planId] ?? [];
	const latest = activeFullProductForPlan({ planId, productStatesContext });
	if (!latest) return [];

	return computeVersioningOptionsForPlan({
		hasCustomers: productKeyToState({
			productKey: productToProductKey({ product: latest }),
			productStatesContext,
		}).customerUsage.hasVersionableCustomerProducts,
		isLatestVersion: true,
		hasMultipleVersions: versions.length > 1,
	});
};

/** This plan's options unioned with license parents and variants. */
export const computeVersioningOptions = ({
	upsert,
	versionsForPlan,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	versionsForPlan: FullProduct[];
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const isNewVersionMint =
		upsert.row.op === "create" && upsert.row.versioning === "new_version";
	const activeVersion = activeVersionForPlan({
		planId: upsert.row.planId,
		productStatesContext,
	});
	const isLatestUpdate =
		activeVersion !== undefined && activeVersion === upsert.row.version;

	const options = computeVersioningOptionsForPlan({
		hasCustomers: upsert.state.hasCustomers,
		isLatestVersion: isNewVersionMint || isLatestUpdate,
		hasMultipleVersions: versionsForPlan.length > 1,
	});

	const product = upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	const parentInternalIds = new Set(
		versionsForPlan.map((version) => version.internal_id),
	);
	const followPlanIds = new Set([
		...parentLicensePlanIds({ product }),
		...(product?.variants ?? []).map((variant) => variant.id),
		...versionsForPlan.flatMap((version) =>
			(version.variants ?? []).map((variant) => variant.id),
		),
		...(upsert.declaredVariants ?? []).map(
			(variant) => variant.variant_plan_id,
		),
	]);
	for (const versions of Object.values(productStatesContext.versionsByPlanId)) {
		for (const child of versions) {
			if (
				child.base_internal_product_id &&
				parentInternalIds.has(child.base_internal_product_id)
			) {
				followPlanIds.add(child.id);
			}
		}
	}
	followPlanIds.delete(upsert.row.planId);

	for (const planId of followPlanIds) {
		addUnique({
			options,
			add: computeVersioningOptionsForPlanId({
				planId,
				productStatesContext,
			}),
		});
	}

	// new_version is only legal on the latest row — a pinned historical
	// version must not inherit it from a customered variant.
	if (!isNewVersionMint && !isLatestUpdate) {
		return options.filter((option) => option !== "new_version");
	}

	return options;
};
