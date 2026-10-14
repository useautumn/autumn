const PRODUCTION_REGION = "us-east-2";

let warnedRegionUnknown = false;

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
