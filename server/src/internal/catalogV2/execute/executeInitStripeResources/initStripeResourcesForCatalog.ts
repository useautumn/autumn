import { hasMissingStripeResourcesForProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { hydratePlanLicenseProcessor } from "./hydratePlanLicenseProcessor";
import { repointBasePricesToPlanProcessor } from "./repointBasePricesToPlanProcessor";
import { validateAdoptedStripePrices } from "./validateAdoptedStripePrices";
import {
	catalogProductsByInternalId,
	stripeCandidatesFromCatalog,
} from "./stripeCandidatesFromCatalog";

const touchesStripeResources = ({ upsert }: { upsert: UpsertProductPlan }) =>
	upsert.row.op !== "none" || upsert.planLicenses !== undefined;

/** Bases and license children first, then variants, then license parents. */
const stripeInitRank = ({ upsert }: { upsert: UpsertProductPlan }) => {
	if (upsert.planLicenses !== undefined) return 2;
	if (upsert.row.nextFullProduct.base_internal_product_id) return 1;
	return 0;
};

/**
 * Execute-phase Stripe init for written rows. Uses the projected catalog —
 * no product reads. Sequential so a later row sees Stripe ids mutated onto
 * an earlier nextFullProduct (family candidates, plan-license processors).
 * Creation guards live inside initStripeResourcesForProducts.
 */
export const initStripeResourcesForCatalog = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const catalogByInternalId = catalogProductsByInternalId({
		products: [
			...updateCatalogPlan.projected.products,
			...updateCatalogPlan.upsertProducts.map(
				(upsert) => upsert.row.nextFullProduct,
			),
		],
	});

	const targets = updateCatalogPlan.upsertProducts
		.filter((upsert) => touchesStripeResources({ upsert }))
		.sort(
			(a, b) => stripeInitRank({ upsert: a }) - stripeInitRank({ upsert: b }),
		);

	// Ahead of the completeness skip and the Live guard below, so a stated id
	// is checked in every environment even when nothing needs creating.
	await validateAdoptedStripePrices({ ctx, upsertProducts: targets });
	// Ahead of init so a cleared price is minted under the new product below.
	await repointBasePricesToPlanProcessor({ ctx, upsertProducts: targets });

	for (const upsert of targets) {
		const product = upsert.row.nextFullProduct;
		catalogByInternalId.set(product.internal_id, product);
		hydratePlanLicenseProcessor({ product, catalogByInternalId });
		if (!hasMissingStripeResourcesForProduct({ product })) continue;

		const candidateProducts = stripeCandidatesFromCatalog({
			product,
			catalogByInternalId,
		});

		await initStripeResourcesForProducts({
			ctx,
			products: [product],
			candidateProducts,
			allowCreate: upsert.createInStripe === true,
			lookupVariantFamilies: false,
		});
	}
};
