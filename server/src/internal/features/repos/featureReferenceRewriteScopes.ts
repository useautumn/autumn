import type { AppEnv } from "@autumn/shared";

export const FEATURE_REWRITE_ROW_LIMIT = 100;

export type FeatureRewriteScopeIds = {
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	featureId: string;
};
