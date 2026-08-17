import type { CatalogVariantParams, FullProduct } from "@autumn/shared";
import { productToProductKey } from "@autumn/shared";
import { buildVariantEditDiff } from "../editDiff/buildVariantEditDiff";
import { variantSettingsPlanParams } from "../editDiff/variantSettingsPlanParams";
import { baseRowMinted } from "../variantPlanUtils";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const latestHasCustomers = ({
	latest,
	productStatesContext,
}: {
	latest: FullProduct;
	productStatesContext: ProductStatesContext;
}): boolean =>
	productKeyToState({
		productKey: productToProductKey({ product: latest }),
		productStatesContext,
	}).customerUsage.hasVersionableCustomerProducts;

const declaredCustomizeForLatest = ({
	planId,
	latestVersion,
	declaredVariants,
}: {
	planId: string;
	latestVersion: number;
	declaredVariants: CatalogVariantParams[];
}): CatalogVariantParams["customize"] =>
	declaredVariants.find(
		(variant) =>
			variant.variant_plan_id === planId &&
			(variant.version === undefined || variant.version === latestVersion) &&
			variant.customize,
	)?.customize;

const mintablePlanIds = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): string[] => {
	const planIds = new Set<string>();
	for (const target of upsert.propagate?.variants ?? []) {
		if (target.version !== undefined) continue;
		planIds.add(target.plan_id);
	}
	for (const variant of upsert.declaredVariants ?? []) {
		if (!variant.customize || variant.version !== undefined) continue;
		planIds.add(variant.variant_plan_id);
	}
	return [...planIds];
};

/** Parent `new_version` → mint max+1 when latest has customers. */
export const deriveVariantMints = ({
	upsert,
	projectedProductStatesContext,
}: {
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	if (upsert.row.versioning !== "new_version") return [];

	const settingsCurrent =
		upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	const settingsPatch = variantSettingsPlanParams({
		current: settingsCurrent,
		next: upsert.row.nextFullProduct,
	});
	const pointer = baseRowMinted({ upsert })
		? upsert.row.nextFullProduct.internal_id
		: undefined;
	const baseCurrent =
		upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	const mintedPlanIds = new Set<string>();
	const intents: ProductUpsertIntent[] = [];

	for (const planId of mintablePlanIds({ upsert })) {
		if (mintedPlanIds.has(planId)) continue;

		const latest =
			projectedProductStatesContext.versionsByPlanId[planId]?.[0];
		if (!latest) continue;
		if (
			!latestHasCustomers({
				latest,
				productStatesContext: projectedProductStatesContext,
			})
		) {
			continue;
		}

		const follow = (upsert.propagate?.variants ?? []).some(
			(target) => target.plan_id === planId,
		);
		const editDiff = buildVariantEditDiff({
			variantProduct: latest,
			baseCurrent,
			baseNext: upsert.row.nextFullProduct,
			follow,
			customize: declaredCustomizeForLatest({
				planId,
				latestVersion: latest.version,
				declaredVariants: upsert.declaredVariants ?? [],
			}),
			declaredLicenses: upsert.declaredLicenses,
		});

		mintedPlanIds.add(planId);
		intents.push({
			productKey: { planId, version: latest.version + 1 },
			planParams: {
				plan_id: planId,
				version: latest.version + 1,
				versioning: "new_version",
				...settingsPatch,
			},
			source: "variant_propagation",
			...(editDiff ? { editDiff } : {}),
			...(pointer !== undefined ? { baseInternalProductId: pointer } : {}),
		});
	}

	return intents;
};
