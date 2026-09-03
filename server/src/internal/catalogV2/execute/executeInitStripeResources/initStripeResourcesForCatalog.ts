import { hasMissingStripeResourcesForProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { applyStripeResourceReuseForProduct } from "@/internal/products/stripeResourceUtils/applyStripeResourceReuseForProduct";
import { hydratePlanLicenseProcessor } from "./hydratePlanLicenseProcessor";
import { repointBasePricesToPlanProcessor } from "./repointBasePricesToPlanProcessor";
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
 * Rows Stripe init walks, in the order it walks them. Shared with the pre-write
 * validation pass so a stated id is checked against exactly the set that would
 * have consumed it.
 */
export const stripeInitTargets = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): UpsertProductPlan[] =>
	updateCatalogPlan.upsertProducts
		.filter((upsert) => touchesStripeResources({ upsert }))
		.sort(
			(a, b) => stripeInitRank({ upsert: a }) - stripeInitRank({ upsert: b }),
		);

/**
 * Execute-phase Stripe init for written rows. Uses the projected catalog —
 * no product reads. Sequential so a later row sees Stripe ids mutated onto
 * an earlier nextFullProduct (family candidates, plan-license processors).
 * Creation guards live inside initStripeResourcesForProducts.
 *
 * Adopted-price validation runs earlier, before the first catalog write —
 * see `validateCatalogBeforeWrites` in executeUpdateCatalogPlan.
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

	const targets = stripeInitTargets({ updateCatalogPlan });

	// Ahead of init so a cleared price is minted under the new product below.
	await repointBasePricesToPlanProcessor({ ctx, upsertProducts: targets });

	for (const upsert of targets) {
		const product = upsert.row.nextFullProduct;
		catalogByInternalId.set(product.internal_id, product);
		// The request asked for NO Stripe product on this row. A paid plan with a
		// cleared processor reads as "missing resources", so init would mint a
		// replacement and undo the unlink inside its own request. Attach mints
		// lazily, so the plan is re-created under Stripe the next time it is sold.
		if (upsert.stripeUnlinked) continue;
		hydratePlanLicenseProcessor({ product, catalogByInternalId });
		if (!hasMissingStripeResourcesForProduct({ product })) continue;

		const candidateProducts = stripeCandidatesFromCatalog({
			product,
			catalogByInternalId,
		});

		if (upsert.createInStripe === false) {
			await applyStripeResourceReuseForProduct({
				ctx,
				product,
				candidateProducts,
			});
			continue;
		}

		await initStripeResourcesForProducts({
			ctx,
			products: [product],
			candidateProducts,
			lookupVariantFamilies: false,
		});
	}
};
