import type { Snippet } from "./types";

const PRODUCT_ID_PLACEHOLDER = "pro_plan";
const FEATURE_ID_PLACEHOLDER = "api_calls";

export function applyDynamicParams({
	snippet,
	productId,
	featureId,
}: {
	snippet: Snippet;
	productId?: string;
	featureId?: string;
}): Snippet {
	let code = snippet.code;

	if (productId) {
		code = code.replace(new RegExp(PRODUCT_ID_PLACEHOLDER, "g"), productId);
	}

	if (featureId) {
		code = code.replace(new RegExp(FEATURE_ID_PLACEHOLDER, "g"), featureId);
	}

	return { ...snippet, code };
}
