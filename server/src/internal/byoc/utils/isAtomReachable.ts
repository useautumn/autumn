const REACHABLE_TIMEOUT_MS = 2000;

/** Autumn reaches the Atom when its unauthenticated health route answers 2xx in time. */
export const isAtomReachable = async ({
	endpointUrl,
}: {
	endpointUrl: string;
}): Promise<boolean> => {
	try {
		const response = await fetch(new URL("/health", endpointUrl), {
			redirect: "error",
			signal: AbortSignal.timeout(REACHABLE_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
};
