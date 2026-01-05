import type { SDKType } from "@/hooks/stores/useSDKStore";
import { getCurlSnippet } from "./curlSnippets";
import { applyDynamicParams } from "./dynamicSnippets";
import { getNodeSnippet } from "./nodeSnippets";
import { getPythonSnippet } from "./pythonSnippets";
import { getReactSnippet } from "./reactSnippets";
import type {
	DynamicSnippetParams,
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
	dynamicParams,
}: GetSnippetParams): Snippet {
	let snippet: Snippet;

	switch (sdk) {
		case "react":
			snippet = getReactSnippet({ id, stackConfig });
			break;
		case "node":
			snippet = getNodeSnippet({ id });
			break;
		case "python":
			snippet = getPythonSnippet({ id });
			break;
		case "curl":
			snippet = getCurlSnippet({ id });
			break;
		default:
			snippet = getNodeSnippet({ id });
	}

	// Apply dynamic params if provided
	if (dynamicParams) {
		snippet = applyDynamicParams({
			snippet,
			productId: dynamicParams.productId,
			featureId: dynamicParams.featureId,
		});
	}

	return snippet;
}

export function getSnippetsForStep({
	stepId,
	sdk,
	stackConfig,
	dynamicParams,
}: {
	stepId: StepId;
	sdk: SDKType;
	stackConfig?: StackConfig;
	dynamicParams?: DynamicSnippetParams;
}): Snippet[] {
	const stepSnippets = STEP_SNIPPETS[stepId];
	const snippetIds: SnippetId[] =
		sdk === "react"
			? stepSnippets.react
			: sdk === "curl"
				? stepSnippets.curl
				: stepSnippets.other;

	return snippetIds.map((id) =>
		getSnippet({ id, sdk, stackConfig, dynamicParams }),
	);
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
