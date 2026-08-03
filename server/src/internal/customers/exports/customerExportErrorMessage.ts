export const getCustomerExportErrorMessage = ({
	error,
	fallback,
}: {
	error: unknown;
	fallback?: string;
}) => {
	if (error instanceof Error) return error.message;
	if (fallback) return fallback;
	return error == null ? "Unknown error" : String(error);
};
