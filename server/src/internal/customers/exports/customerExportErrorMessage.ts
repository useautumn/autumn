export const getCustomerExportErrorMessage = ({
	error,
	fallback,
}: {
	error: unknown;
	fallback?: string;
}) => {
	if (error instanceof Error) return error.message;
	if (fallback) return fallback;
	// String(null) would surface a literal "null" to customers.
	return error == null ? "Unknown error" : String(error);
};
