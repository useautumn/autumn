/** Staging runs production images, so `NODE_ENV` alone cannot tell it from production. */
export const isStagingEnv = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean => runtimeEnv.STAGING_ENVIRONMENT === "true";
