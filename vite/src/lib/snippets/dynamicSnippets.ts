import type { Snippet } from "./types";

const PRODUCT_ID_PLACEHOLDER = "pro_plan";
const FEATURE_ID_PLACEHOLDER = "api_calls";
const LIMIT_MESSAGE_PLACEHOLDER = "You've reached your limit!";
const BOOLEAN_ACCESS_MESSAGE = "You don't have access";

export function applyDynamicParams({
	snippet,
	productId,
	featureId,
	isBoolean,
}: {
	snippet: Snippet;
	productId?: string;
	featureId?: string;
	isBoolean?: boolean;
}): Snippet {
	let code = snippet.code;

	if (productId) {
		code = code.replace(new RegExp(PRODUCT_ID_PLACEHOLDER, "g"), productId);
	}

	if (featureId) {
		code = code.replace(new RegExp(FEATURE_ID_PLACEHOLDER, "g"), featureId);
	}

	if (isBoolean) {
		code = code.replace(LIMIT_MESSAGE_PLACEHOLDER, BOOLEAN_ACCESS_MESSAGE);
	}

	return { ...snippet, code };
}
