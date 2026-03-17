/**
 * Prompts for the onboarding guide steps.
 * These are the CLI skill contents (which already include setup/config instructions).
 * The single source of truth lives in packages/atmn/src/prompts/skills/.
 */

import { autumnGatingContent, autumnSetupContent } from "atmn/skills";
import { useCallback } from "react";

function stripYamlFrontmatter({ content }: { content: string }): string {
	return content.replace(/^---[\s\S]*?---\n*/, "");
}

const ONBOARDING_PROMPTS: Record<string, string> = {
	customer: stripYamlFrontmatter({ content: autumnSetupContent }),
	usage: stripYamlFrontmatter({ content: autumnGatingContent }),
};

/**
 * Hook to get onboarding prompts for clipboard copy.
 */
export function useOnboardingPrompt() {
	const getPrompt = useCallback(
		({ stepId }: { stepId: string }): string =>
			ONBOARDING_PROMPTS[stepId] ?? "",
		[],
	);

	return { getPrompt };
}
