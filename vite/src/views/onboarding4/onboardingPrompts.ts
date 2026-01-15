/**
 * Prompts for the onboarding guide steps.
 * These are copied to clipboard when users click "Copy prompt".
 *
 * Edit the .md files in the prompts/ folder directly - no escaping needed!
 * Use {{PLACEHOLDER}} syntax for dynamic values.
 */

import {
	type CreditSystemConfig,
	type Feature,
	FeatureType,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import { useCallback, useMemo } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import customerPrompt from "./prompts/customer.md?raw";
import paymentsPrompt from "./prompts/payments.md?raw";
import usagePrompt from "./prompts/usage.md?raw";

const ONBOARDING_PROMPTS: Record<string, string> = {
	customer: customerPrompt,
	payments: paymentsPrompt,
	usage: usagePrompt,
};

/** Check if any product has prepaid items */
function hasPrepaidItems({ products }: { products: ProductV2[] }): boolean {
	return products.some((p) =>
		p.items.some((item) => item.usage_model === UsageModel.Prepaid),
	);
}

/** Check if any feature is a credit system */
function hasCreditSystem({ features }: { features: Feature[] }): boolean {
	return features.some((f) => f.type === FeatureType.CreditSystem);
}

function buildAutumnConfig({
	products,
	features,
}: {
	products: ProductV2[];
	features: Feature[];
}): string {
	if (products.length === 0 && features.length === 0) {
		return "(No products or features created yet)";
	}

	const config = {
		products: products.map((p) => ({
			id: p.id,
			name: p.name,
			is_add_on: p.is_add_on,
			is_default: p.is_default,
			group: p.group,
			free_trial: p.free_trial,
			items: p.items.map((item) => {
				const mappedItem: Record<string, unknown> = {};

				// Always include type if present
				if (item.type) mappedItem.type = item.type;

				// Feature fields
				if (item.feature_id !== undefined)
					mappedItem.feature_id = item.feature_id;
				if (item.feature_type) mappedItem.feature_type = item.feature_type;
				if (item.included_usage !== undefined)
					mappedItem.included_usage = item.included_usage;

				// Price fields
				if (item.price !== undefined) mappedItem.price = item.price;
				if (item.tiers && item.tiers.length > 0) mappedItem.tiers = item.tiers;
				if (item.usage_model) mappedItem.usage_model = item.usage_model;
				if (item.billing_units) mappedItem.billing_units = item.billing_units;

				// Interval
				if (item.interval !== undefined) mappedItem.interval = item.interval;

				return mappedItem;
			}),
		})),
		features: features.map((f) => {
			const mappedFeature: Record<string, unknown> = {
				id: f.id,
				name: f.name,
				type: f.type,
			};

			// Include credit schema for credit system features
			if (f.type === FeatureType.CreditSystem && f.config) {
				const config = f.config as CreditSystemConfig;
				if (config.schema && config.schema.length > 0) {
					mappedFeature.credit_schema = config.schema.map((item) => ({
						metered_feature_id: item.metered_feature_id,
						credit_amount: item.credit_amount,
					}));
				}
			}

			return mappedFeature;
		}),
	};

	return "```json\n" + JSON.stringify(config, null, 2) + "\n```";
}

// Prepaid options snippets
const TS_OPTIONS_COMMENT = `
  // Optional: For prepaid pricing, specify quantities
  // options: [{ feature_id: "feature_id", quantity: 100 }]`;

const PY_OPTIONS_COMMENT = `
    # Optional: For prepaid pricing, specify quantities
    # options=[{"feature_id": "feature_id", "quantity": 100}]`;

const PREPAID_SECTION = `
### Prepaid Pricing

If the product has items with \`usage_model: "prepaid"\`, pass the \`options\` array to specify quantities:

\`\`\`typescript
const { data } = await autumn.checkout({
  customer_id: "user_123",
  product_id: "credits_pack",
  options: [{ feature_id: "credits", quantity: 500 }]
});
\`\`\`
`;

const CREDIT_SYSTEM_NOTE = `
**Credit Systems:** You should only check and track with the underlying metered features (see \`credit_schema\` in the configuration), not the credit system itself. Autumn will automatically map usage and deduct the correct credit amount.
`;

/**
 * Hook to get onboarding prompts with dynamic values populated.
 */
export function useOnboardingPrompt() {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const autumnConfig = useMemo(
		() => buildAutumnConfig({ products, features }),
		[products, features],
	);

	const hasPrepaid = hasPrepaidItems({ products });
	const hasCredits = hasCreditSystem({ features });

	const getPrompt = useCallback(
		({ stepId }: { stepId: string }): string => {
			let prompt = ONBOARDING_PROMPTS[stepId] ?? "";

			// Replace dynamic placeholders
			prompt = prompt.replace("{{AUTUMN_CONFIG}}", autumnConfig);

			// Replace prepaid options placeholders
			if (hasPrepaid) {
				prompt = prompt.replace("{{TS_CHECKOUT_OPTIONS}}", TS_OPTIONS_COMMENT);
				prompt = prompt.replace("{{TS_ATTACH_OPTIONS}}", TS_OPTIONS_COMMENT);
				prompt = prompt.replace("{{PY_CHECKOUT_OPTIONS}}", PY_OPTIONS_COMMENT);
				prompt = prompt.replace("{{PY_ATTACH_OPTIONS}}", PY_OPTIONS_COMMENT);
				prompt = prompt.replace("{{PREPAID_SECTION}}", PREPAID_SECTION);
			} else {
				// Remove placeholders if no prepaid items
				prompt = prompt.replace("{{TS_CHECKOUT_OPTIONS}}", "");
				prompt = prompt.replace("{{TS_ATTACH_OPTIONS}}", "");
				prompt = prompt.replace("{{PY_CHECKOUT_OPTIONS}}", "");
				prompt = prompt.replace("{{PY_ATTACH_OPTIONS}}", "");
				prompt = prompt.replace("{{PREPAID_SECTION}}", "");
			}

			// Replace credit system note placeholder
			if (hasCredits) {
				prompt = prompt.replace("{{CREDIT_SYSTEM_NOTE}}", CREDIT_SYSTEM_NOTE);
			} else {
				prompt = prompt.replace("{{CREDIT_SYSTEM_NOTE}}", "");
			}

			return prompt;
		},
		[autumnConfig, hasPrepaid, hasCredits],
	);

	return { getPrompt };
}
