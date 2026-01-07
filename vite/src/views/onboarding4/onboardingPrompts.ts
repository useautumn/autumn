/**
 * Prompts for the onboarding guide steps.
 * These are copied to clipboard when users click "Copy prompt".
 *
 * Edit the .md files in the prompts/ folder directly - no escaping needed!
 * Use {{PLACEHOLDER}} syntax for dynamic values.
 */

import type { Feature, ProductV2 } from "@autumn/shared";
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
			items: p.items.map((item) => ({
				feature_id: item.feature_id,
				feature_type: item.feature_type,
				included_usage: item.included_usage,
				price: item.price,
				interval: item.interval,
			})),
		})),
		features: features.map((f) => ({
			id: f.id,
			name: f.name,
			type: f.type,
		})),
	};

	return "```json\n" + JSON.stringify(config, null, 2) + "\n```";
}

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

	const getPrompt = useCallback(
		({ stepId }: { stepId: string }): string => {
			let prompt = ONBOARDING_PROMPTS[stepId] ?? "";

			// Replace dynamic placeholders
			prompt = prompt.replace("{{AUTUMN_CONFIG}}", autumnConfig);

			return prompt;
		},
		[autumnConfig],
	);

	return { getPrompt };
}
