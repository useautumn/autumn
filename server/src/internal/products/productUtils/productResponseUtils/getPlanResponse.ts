import {
	type ApiFreeTrialV2,
	ApiFreeTrialV2Schema,
	type ApiPlan,
	ApiPlanSchema,
	AttachScenario,
	type BillingInterval,
	type Feature,
	type FeatureOptions,
	type FullCustomer,
	type FullProduct,
	productV2ToBasePrice,
	productV2ToFeatureItems,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getFreeTrialAfterFingerprint } from "../../free-trials/freeTrialUtils.js";
import { sortProductItems } from "../../pricecn/pricecnUtils.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { itemsToPlanFeatures } from "../apiPlanUtils/planFeatureUtils/itemsToPlanFeatures.js";
import { getAttachScenario } from "./getAttachScenario.js";

/**
 * Get free trial response in Plan V2 format
 */
const getFreeTrialV2Response = async ({
	db,
	product,
	fullCus,
	attachScenario,
}: {
	db?: DrizzleCli;
	product: FullProduct;
	fullCus?: FullCustomer;
	attachScenario: AttachScenario;
}): Promise<ApiFreeTrialV2 | null> => {
	if (!product.free_trial) return null;

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
			return null;
		}
	}

	return ApiFreeTrialV2Schema.parse({
		duration_type: product.free_trial.duration,
		duration_length: product.free_trial.length,
		card_required: product.free_trial.card_required ?? false,
	});
};

/**
 * Convert FullProduct (DB format) to Plan API response format
 */
export const getPlanResponse = async ({
	product,
	features,
	fullCus,
	db,
	options,
}: {
	product: FullProduct;
	features: Feature[];
	fullCus?: FullCustomer;
	db?: DrizzleCli;
	options?: FeatureOptions[];
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
	const basePrice = productV2ToBasePrice({ product: productV2 as any });

	// 5. Get feature items only (no base price)
	const featureItems = productV2ToFeatureItems({
		items: sortedItems,
		withBasePrice: false, // Don't include base price in features
	});

	// 6. Convert items to plan features
	const planFeatures = itemsToPlanFeatures({ items: featureItems });

	// 7. Get attach scenario for customer context
	const attachScenario = getAttachScenario({
		fullCus,
		fullProduct: product,
	});

	// 8. Get free trial in V2 format
	const freeTrial = await getFreeTrialV2Response({
		db,
		product,
		fullCus,
		attachScenario,
	});

	console.log(
		`New feature:\n ${JSON.stringify(
			{
				// Basic fields
				id: product.id,
				name: product.name || "",
				description: product.description, // Products don't have descriptions
				group: product.group,
				version: product.version,

				// Boolean flags
				add_on: product.is_add_on,
				default: product.is_default,

				// Price field (required in Plan schema)
				price: basePrice
					? {
							amount: basePrice.amount,
							interval: basePrice.interval as unknown as BillingInterval,
						}
					: {
							amount: 0,
							interval: "month" as BillingInterval,
						},

				// Features array
				features: planFeatures,

				// Free trial
				free_trial: freeTrial,

				// Metadata fields
				created_at: product.created_at,
				env: product.env,
				archived: product.archived,
				base_variant_id: product.base_variant_id,

				// Customer context (optional)
				// Uncomment when ready to add customer context
				// customer_context: {
				//     trial_available: notNullish(freeTrial),
				//     scenario: attachScenario,
				// },
			},
			null,
			4,
		)}`,
	);

	// 9. Build Plan response
	return ApiPlanSchema.parse({
		// Basic fields
		id: product.id,
		name: product.name || "",
		description: product.description, // Products don't have descriptions
		group: product.group,
		version: product.version,

		// Boolean flags
		add_on: product.is_add_on,
		default: product.is_default,

		// Price field (required in Plan schema)
		price: basePrice
			? {
					amount: basePrice.amount,
					interval: basePrice.interval as unknown as BillingInterval,
				}
			: {
					amount: 0,
					interval: "month" as BillingInterval,
				},

		// Features array
		features: planFeatures,

		// Free trial
		free_trial: freeTrial,

		// Metadata fields
		created_at: product.created_at,
		env: product.env,
		archived: product.archived,
		base_variant_id: product.base_variant_id,

		// Customer context (optional)
		// Uncomment when ready to add customer context
		// customer_context: {
		//     trial_available: notNullish(freeTrial),
		//     scenario: attachScenario,
		// },
	});
};
