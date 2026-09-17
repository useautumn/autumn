const statusCodeOf = ({ error }: { error: unknown }): number | null => {
	if (typeof error !== "object" || error === null || !("$metadata" in error)) {
		return null;
	}
	const metadata = error.$metadata;
	if (typeof metadata !== "object" || metadata === null) return null;
	if (!("httpStatusCode" in metadata)) return null;
	return typeof metadata.httpStatusCode === "number"
		? metadata.httpStatusCode
		: null;
};

export const isS3ConditionalConflict = ({
	error,
}: {
	error: unknown;
}): boolean => {
	const statusCode = statusCodeOf({ error });
	return statusCode === 404 || statusCode === 409 || statusCode === 412;
};

export const isRetriableS3Error = ({ error }: { error: unknown }): boolean => {
	const statusCode = statusCodeOf({ error });
	return (
		statusCode === null ||
		statusCode === 408 ||
		statusCode === 409 ||
		statusCode === 429 ||
		statusCode >= 500
	);
};
