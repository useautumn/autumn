import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const BLACKLISTED_PATH_PATTERNS = [
	/^\/v1\/apps\/secrets(\/|$)/,
	/^\/v1\/accounts(\/|$)/,
	/^\/v1\/application_fees(\/|$)/,
	/^\/v1\/transfers(\/|$)/,
	/^\/v1\/files\/[^/]+\/contents(\/|$)/,
	/^\/v1\/quotes\/[^/]+\/pdf(\/|$)/,
];

const SENSITIVE_EXPAND_SEGMENTS = new Set(["number", "cvc"]);

const reject = (message: string): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidInputs,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

export const isBlacklistedStripePath = ({ path }: { path: string }) =>
	BLACKLISTED_PATH_PATTERNS.some((pattern) => pattern.test(path.toLowerCase()));

/** Every leaf under an expand key, however nested: qs serializes them all. */
const leafStrings = (value: unknown): string[] => {
	if (Array.isArray(value)) return value.flatMap(leafStrings);
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(leafStrings);
	}
	return [String(value)];
};

const expandValues = ({
	params,
}: {
	params?: Record<string, unknown>;
}): string[] =>
	Object.entries(params ?? {})
		.filter(([key]) => key.startsWith("expand"))
		.flatMap(([, value]) => leafStrings(value));

export const validateStripeReadRequest = ({
	path,
	params,
}: {
	path: string;
	params?: Record<string, unknown>;
}) => {
	if (!/^\/v[12]\//.test(path)) {
		reject("Stripe path must start with /v1/ or /v2/ (no host or scheme).");
	}
	if (path.includes("..") || path.includes("//")) {
		reject("Stripe path must not contain '..' or '//'.");
	}
	if (/[?#]/.test(path)) {
		reject("Stripe path must not contain a query string; pass params instead.");
	}
	if (isBlacklistedStripePath({ path })) {
		reject(`Stripe endpoint ${path} is not available for read access.`);
	}

	const sensitiveExpand = expandValues({ params }).find((value) =>
		value
			.toLowerCase()
			.split(".")
			.some((segment) => SENSITIVE_EXPAND_SEGMENTS.has(segment)),
	);
	if (sensitiveExpand) {
		reject(`Expanding '${sensitiveExpand}' is not allowed.`);
	}
};
