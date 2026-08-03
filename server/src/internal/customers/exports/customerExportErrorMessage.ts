export const getCustomerExportErrorMessage = ({
	error,
	fallback,
}: {
	error: unknown;
	fallback?: string;
}) => (error instanceof Error ? error.message : (fallback ?? String(error)));
