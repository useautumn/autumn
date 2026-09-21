import type { ApiPlanExpandedV1, ApiPlanV1 } from "@api/products/apiPlanV1";
import {
	ApiPlanExpandedV1Schema,
	ApiPlanV1Schema,
} from "@api/products/apiPlanV1";
import type { FullProduct } from "@models/productModels/productModels";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import type { DiffablePlanV1 } from "@utils/planV1Utils/diff/diffPlanV1";
import { isTrialCardRequired } from "@utils/productUtils/classifyProduct/isTrialCardRequired";
import type { RevenueCatPlanMapping } from "@utils/productUtils/convertProduct/productToPlanProcessors";
import { mapToProductV2 } from "@utils/productV2Utils/mapToProductV2";
import { productV2ToApiPlanV1 } from "@utils/productV2Utils/productV2ToApiPlanV1";
import { fullPlanLicenseToApiPlanLicense } from "./licenses/fullPlanLicenseToApiPlanLicense";
import type { ApiPlanContext } from "./types/apiPlanContext";
import { apiPlanToVariantDetails } from "./variants/apiPlanToVariantDetails";
import { fullProductToApiPlanVariant } from "./variants/fullProductToApiPlanVariant";

export type FullProductToApiPlanParams = {
	ctx: ApiPlanContext;
	product: FullProduct;
	currency?: string;
	/** Read from the customer by the caller; a plan on its own has none. */
	customerEligibility?: ApiPlanV1["customer_eligibility"];
	/** A variant's base, already rendered or still as rows; without either the plan states nothing about its base. */
	basePlan?: DiffablePlanV1;
	baseFullProduct?: FullProduct;
	/** RevenueCat mappings live in their own table, so the rows are read in, keyed by plan id: a variant owns its own row. */
	revenuecatMappings?: ReadonlyMap<string, RevenueCatPlanMapping>;
	/** Keep each license entry's rendered effective plan. */
	expandLicensePlans?: boolean;
	/** Attach variants[] edges built from the product's hydrated variants. */
	expandVariants?: boolean;
};

/** The items-based product the plan converter renders, with a stored plan's response rules applied to its DB meta. */
const fullProductToResponseProductV2 = ({
	ctx,
	product,
}: {
	ctx: ApiPlanContext;
	product: FullProduct;
}): ProductV2 => ({
	...mapToProductV2({ product, features: ctx.features }),
	created_at: product.created_at ?? 0,
	// The context's env stands in for a product row that carries none of its own.
	env: product.env ?? ctx.env,
	free_trial: product.free_trial
		? {
				...product.free_trial,
				card_required: isTrialCardRequired({ product }),
			}
		: product.free_trial,
});

/**
 * A stored plan as the API returns it, from rows alone: no customer and no database.
 * Expansions keep the plan's graph edges (license plans, variants) in the response.
 */
export function fullProductToApiPlan(
	params: FullProductToApiPlanParams & { expandLicensePlans: true },
): ApiPlanExpandedV1;
export function fullProductToApiPlan(
	params: FullProductToApiPlanParams & { expandVariants: true },
): ApiPlanExpandedV1;
export function fullProductToApiPlan(
	params: FullProductToApiPlanParams & {
		expandLicensePlans?: false;
		expandVariants?: false;
	},
): ApiPlanV1;
export function fullProductToApiPlan(
	params: FullProductToApiPlanParams,
): ApiPlanV1 | ApiPlanExpandedV1;
export function fullProductToApiPlan({
	ctx,
	product,
	currency = "usd",
	customerEligibility,
	basePlan,
	baseFullProduct,
	revenuecatMappings,
	expandLicensePlans = false,
	expandVariants = false,
}: FullProductToApiPlanParams): ApiPlanV1 | ApiPlanExpandedV1 {
	const renderedPlan = productV2ToApiPlanV1({
		product: fullProductToResponseProductV2({ ctx, product }),
		features: ctx.features,
		currency,
		expand: ctx.expand,
		customerEligibility,
		includeProcessors: true,
		revenuecatMapping: revenuecatMappings?.get(product.id),
	});

	// The two fields the converter leaves out of a stored plan's response.
	const plan = {
		...renderedPlan,
		free_trial: renderedPlan.free_trial
			? {
					...renderedPlan.free_trial,
					on_end: renderedPlan.free_trial.on_end ?? null,
				}
			: undefined,
		base_variant_id: product.base_variant_id ?? null,
	} satisfies ApiPlanV1;

	// License links ride along so a variant's customize can state its license overlay.
	const licenses = product.licenses?.length
		? product.licenses.map((license) =>
				fullPlanLicenseToApiPlanLicense({
					ctx,
					license,
					currency,
					expandPlan: expandLicensePlans,
				}),
			)
		: undefined;
	const planWithLicenses = { ...plan, ...(licenses ? { licenses } : {}) };

	const variantDetails = apiPlanToVariantDetails({
		ctx,
		plan: planWithLicenses,
		currency,
		basePlan,
		baseFullProduct,
	});
	const variants =
		expandVariants && product.variants?.length
			? product.variants.map((variant) =>
					fullProductToApiPlanVariant({
						ctx,
						basePlan: planWithLicenses,
						variant,
						currency,
						revenuecatMappings,
					}),
				)
			: undefined;

	const planResponse = {
		...planWithLicenses,
		...(variantDetails ? { variant_details: variantDetails } : {}),
		...(variants ? { variants } : {}),
	};

	return expandLicensePlans || expandVariants || licenses
		? ApiPlanExpandedV1Schema.parse(planResponse)
		: ApiPlanV1Schema.parse(planResponse);
}
