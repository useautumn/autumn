const EXPECTED_ERROR_KIND = "expected";

const isClientErrorStatus = (statusCode: unknown) =>
	typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;

export const isRoutineWarning = (record: Record<string, unknown>): boolean => {
	if (isClientErrorStatus(record.statusCode)) return true;
	const { error } = record;
	return (
		typeof error === "object" &&
		error !== null &&
		"kind" in error &&
		error.kind === EXPECTED_ERROR_KIND
	);
};
