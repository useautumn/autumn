import type { Snippet } from "./types";

const PRODUCT_ID_PLACEHOLDER = "pro_plan";
const FEATURE_ID_PLACEHOLDER = "api_calls";
const PREPAID_FEATURE_ID_PLACEHOLDER = "prepaid_feature";
const LIMIT_MESSAGE_PLACEHOLDER = "You've reached your limit!";
const BOOLEAN_ACCESS_MESSAGE = "You don't have access";

export function applyDynamicParams({
	snippet,
	productId,
	featureId,
	isBoolean,
	prepaidFeatureId,
}: {
	snippet: Snippet;
	productId?: string;
	featureId?: string;
	isBoolean?: boolean;
	prepaidFeatureId?: string;
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

	if (prepaidFeatureId) {
		code = code.replace(
			new RegExp(PREPAID_FEATURE_ID_PLACEHOLDER, "g"),
			prepaidFeatureId,
		);
	}

	return { ...snippet, code };
}
