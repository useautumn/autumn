const PUBLISHED_PACKAGE = "atmn-nightly";

/**
 * Specifier a scaffolded autumn.config.ts imports from. The published CLI
 * writes `atmn-nightly`; local `atl` / evals set ATMN_CONFIG_PACKAGE=atmn so
 * the config already matches the name the package will ship under.
 */
export const configPackageName = (): string => {
	const override = process.env.ATMN_CONFIG_PACKAGE?.trim();
	return override && override.length > 0 ? override : PUBLISHED_PACKAGE;
};
