const PUBLISHED_PACKAGE = "atmn";

/**
 * Specifier a scaffolded autumn.config.ts imports from.
 */
export const configPackageName = (): string => {
	const override = process.env.ATMN_CONFIG_PACKAGE?.trim();
	return override && override.length > 0 ? override : PUBLISHED_PACKAGE;
};
