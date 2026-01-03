import type { SDKType } from "@/hooks/stores/useSDKStore";
import { getCurlSnippet } from "./curlSnippets";
import { getNodeSnippet } from "./nodeSnippets";
import { getPythonSnippet } from "./pythonSnippets";
import { getReactSnippet } from "./reactSnippets";
import type {
	GetSnippetParams,
	Snippet,
	SnippetId,
	StackConfig,
	StepId,
} from "./types";
import { STEP_SNIPPETS } from "./types";

export function getSnippet({
	id,
	sdk,
	stackConfig,
}: GetSnippetParams): Snippet {
	switch (sdk) {
		case "react":
			return getReactSnippet({ id, stackConfig });
		case "node":
			return getNodeSnippet({ id });
		case "python":
			return getPythonSnippet({ id });
		case "curl":
			return getCurlSnippet({ id });
		default:
			return getNodeSnippet({ id });
	}
}

export function getSnippetsForStep({
	stepId,
	sdk,
	stackConfig,
}: {
	stepId: StepId;
	sdk: SDKType;
	stackConfig?: StackConfig;
}): Snippet[] {
	const stepSnippets = STEP_SNIPPETS[stepId];
	const snippetIds: SnippetId[] =
		sdk === "react"
			? stepSnippets.react
			: sdk === "curl"
				? stepSnippets.curl
				: stepSnippets.other;

	return snippetIds.map((id) => getSnippet({ id, sdk, stackConfig }));
}

export function stepNeedsStackConfig({
	stepId,
	sdk,
}: {
	stepId: StepId;
	sdk: SDKType;
}): boolean {
	if (sdk !== "react") return false;
	return STEP_SNIPPETS[stepId].react.includes("backend-setup");
}
