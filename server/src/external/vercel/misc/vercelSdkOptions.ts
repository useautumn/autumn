import { getAutumnEnv } from "@autumn/env";

export type VercelSdkTestOptions = {
	mockVercelApi?: boolean;
};

export const getVercelSdkServerURL = (
	testOptions?: VercelSdkTestOptions,
): string | undefined => {
	if (process.env.NODE_ENV === "production") return undefined;
	if (testOptions?.mockVercelApi !== true) return undefined;
	return `${getAutumnEnv().AUTUMN_API_URL}/__test/vercel/api`;
};
