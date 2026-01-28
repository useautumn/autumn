import {
	type ApiFreeTrialV2,
	ApiFreeTrialV2Schema,
	type ApiPlan,
	ApiPlanSchema,
	AttachScenario,
	type Feature,
	type FullCustomer,
	type FullProduct,
	getProductItemDisplay,
	itemsToPlanFeatures,
	itemToBillingInterval,
	productV2ToBasePrice,
	productV2ToFeatureItems,
	sortProductItems,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getFreeTrialAfterFingerprint } from "../../free-trials/freeTrialUtils.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { getAttachScenario } from "./getAttachScenario.js";

/**
 * Get free trial response in Plan V2 format
 */
const getFreeTrialV2Response = ({
	product,
}: {
	product: FullProduct;
}): ApiFreeTrialV2 | undefined => {
	if (!product.free_trial) return undefined;

	return ApiFreeTrialV2Schema.parse({
		duration_type: product.free_trial.duration,
		duration_length: product.free_trial.length,
		card_required: product.free_trial.card_required ?? false,
	});
};

const getTrialAvailable = async ({
	db,
	product,
	fullCus,
	attachScenario,
}: {
	db?: DrizzleCli;
	product: FullProduct;
	fullCus?: FullCustomer;
	attachScenario: AttachScenario;
}) => {
	if (!product.free_trial) return undefined;

	// Check trial availability if customer exists
	if (db && fullCus) {
		const trial = await getFreeTrialAfterFingerprint({
			db,
			freeTrial: product.free_trial,
			fingerprint: fullCus.fingerprint,
			internalCustomerId: fullCus.internal_id,
			multipleAllowed: false,
			productId: product.id,
		});

		// No trial for downgrades
		if (attachScenario === AttachScenario.Downgrade || !trial) {
			return false;
		}
	}

	return true;
};

/**
 * Convert FullProduct (DB format) to Plan API response format
 */
export const getPlanResponse = async ({
	product,
	features,
	fullCus,
	db,
	currency = "usd",
}: {
	product: FullProduct;
	features: Feature[];
	fullCus?: FullCustomer;
	db?: DrizzleCli;
	currency?: string;
}): Promise<ApiPlan> => {
	// 1. Convert prices/entitlements to items
	const rawItems = mapToProductItems({
		prices: product.prices,
		entitlements: product.entitlements,
		features: features,
	});

	// 2. Sort items
	const sortedItems = sortProductItems(rawItems, features);

	// 3. Create a ProductV2-like object for the helper
	const productV2 = { items: sortedItems };

	// 4. Extract base price using existing helper
	const basePriceItem = productV2ToBasePrice({ product: productV2 as any });
	const basePrice: ApiPlan["price"] | null = basePriceItem
		? {
				amount: basePriceItem.price,
				interval: itemToBillingInterval({ item: basePriceItem }),
				interval_count:
					basePriceItem.interval_count !== 1
						? (basePriceItem.interval_count ?? undefined)
						: undefined,
				display: getProductItemDisplay({
					item: basePriceItem,
					features,
					currency,
				}),
			}
		: null;

	// 5. Get feature items only (no base price)
	const featureItems = productV2ToFeatureItems({
		items: sortedItems,
		withBasePrice: false, // Don't include base price in features
	});

	// 6. Convert items to plan features
	let planFeatures = itemsToPlanFeatures({
		items: featureItems,
		features,
	});

	planFeatures = planFeatures.map((pf) => ({ ...pf, proration: undefined }));

	// 7. Get attach scenario for customer context
	const attachScenario = getAttachScenario({
		fullCus,
		fullProduct: product,
	});

	// 8. Get free trial in V2 format
	const freeTrial = getFreeTrialV2Response({
		product,
	});

	const trialAvailable = await getTrialAvailable({
		db,
		product,
		fullCus,
		attachScenario,
	});

	// 9. Build Plan response
	return ApiPlanSchema.parse({
		// Basic fields
		id: product.id,
		name: product.name || null,
		description: product.description || null, // Products don't have descriptions
		group: product.group || null,
		version: product.version,

		// Boolean flags
		add_on: product.is_add_on,
		default: product.is_default,

		// Price field (optional - only for products with base price)
		price: basePrice,

		// Features array
		features: planFeatures ?? [],

		// Free trial
		free_trial: freeTrial,

		// Metadata fields
		created_at: product.created_at,
		env: product.env,
		archived: product.archived,
		base_variant_id: product.base_variant_id,

		// Customer context (optional)
		customer_eligibility: fullCus
			? {
					trial_available: trialAvailable,
					scenario: attachScenario,
				}
			: undefined,
	});
};
