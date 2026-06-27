const secretPatterns = [
	/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
	/\bxox[baprs]-[A-Za-z0-9-]{10,}/i,
	/\bsk_(?:live|test|proj)?_[A-Za-z0-9]{12,}/i,
	/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
	/^\s*[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*=\s*\S+/im,
];

/** Defense-in-depth: true if text matches a known secret/token shape. */
export const containsSecret = (value: string) =>
	secretPatterns.some((pattern) => pattern.test(value));
