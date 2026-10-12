/** Every production ECS task runs here with AWS_REGION set; staging runs in us-east-1. */
const PRODUCTION_REGION = "us-east-2";

let warnedRegionUnknown = false;

/** Staging runs production images, so `NODE_ENV` alone cannot tell it from production; a production region never counts as staging. */
export const isStagingEnv = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean => {
	if (runtimeEnv.STAGING_ENVIRONMENT !== "true") return false;
	const region =
		runtimeEnv.AWS_REGION?.trim() || runtimeEnv.AWS_DEFAULT_REGION?.trim();
	if (!region) {
		if (!warnedRegionUnknown) {
			warnedRegionUnknown = true;
			console.warn(
				"[env] STAGING_ENVIRONMENT=true without AWS_REGION: treating this process as staging",
			);
		}
		return true;
	}
	return region !== PRODUCTION_REGION;
};
