/**
 * Prompts for the onboarding guide steps.
 * These are copied to clipboard when users click "Copy prompt".
 *
 * Edit the .md files in the prompts/ folder directly - no escaping needed!
 * Use {{PLACEHOLDER}} syntax for dynamic values.
 */

import { useCallback } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import customerPrompt from "./prompts/customer.md?raw";
import paymentsPrompt from "./prompts/payments.md?raw";
import usagePrompt from "./prompts/usage.md?raw";

const ONBOARDING_PROMPTS: Record<string, string> = {
	customer: customerPrompt,
	payments: paymentsPrompt,
	usage: usagePrompt,
};

/**
 * Hook to get onboarding prompts with dynamic values populated.
 */
export function useOnboardingPrompt() {
	const { products } = useProductsQuery();

	console.log("products", products);
	const productIds = products.map((p) => p.id);

	const getPrompt = useCallback(
		({ stepId }: { stepId: string }): string => {
			let prompt = ONBOARDING_PROMPTS[stepId] ?? "";

			// Replace dynamic placeholders
			if (productIds.length > 0) {
				prompt = prompt.replace(
					"{{PRODUCT_IDS}}",
					productIds.map((id) => `"${id}"`).join(", "),
				);
			} else {
				prompt = prompt.replace("{{PRODUCT_IDS}}", "(none created yet)");
			}

			return prompt;
		},
		[productIds],
	);

	return { getPrompt };
}
