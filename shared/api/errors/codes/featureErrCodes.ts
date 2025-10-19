export const FeatureErrorCode = {
	FeatureNotFound: "feature_not_found",
	FeatureAlreadyExists: "feature_already_exists",
} as const;

export type FeatureErrorCode =
	(typeof FeatureErrorCode)[keyof typeof FeatureErrorCode];
