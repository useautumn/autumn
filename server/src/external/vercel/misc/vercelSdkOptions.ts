export type VercelSdkTestOptions = {
	mockVercelApi?: boolean;
};

/**
 * Only tests opt into the local Vercel SDK mock; dev/manual flows hit Vercel.
 */
export const getVercelSdkServerURL = (
	testOptions?: VercelSdkTestOptions,
): string | undefined => {
	if (process.env.NODE_ENV === "production") return undefined;
	if (testOptions?.mockVercelApi !== true) return undefined;
	const base = process.env.BETTER_AUTH_URL;
	if (!base) return undefined;
	return `${base.replace(/\/$/, "")}/__test/vercel/api`;
};
