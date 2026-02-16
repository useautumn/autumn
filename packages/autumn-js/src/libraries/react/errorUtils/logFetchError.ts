export const logFetchError = ({
	method,
	backendUrl,
	path,
	error,
}: {
	method: string;
	backendUrl: string;
	path: string;
	error: any;
}) => {
	console.error(`[Autumn] Fetch failed: ${method} ${backendUrl}${path}

1. Check that backendUrl in <AutumnProvider/> is correctly set.
2. Check that autumnHandler is correctly registered on your backend.`);
};
