export const FeatureErrorCode = {
	FeatureNotFound: "feature_not_found",
	FeatureAlreadyExists: "duplicate_feature_id",
} as const;

export type FeatureErrorCode =
	(typeof FeatureErrorCode)[keyof typeof FeatureErrorCode];
