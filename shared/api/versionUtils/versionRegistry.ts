import { ApiVersion } from "./ApiVersion.js";

export interface VersionMetadata {
	semver: ApiVersion;
	calver: string;
	releasedAt: number;
	description: string;
	deprecated?: boolean;
	migrateToVersion?: ApiVersion;
}

/**
 * Version Registry (descending order - newest first)
 * SemVer ↔ CalVer mappings and metadata
 */
export const VERSION_REGISTRY: Record<ApiVersion, VersionMetadata> = {
	[ApiVersion.V2_1]: {
		semver: ApiVersion.V2_1,
		calver: "2026-04-01",
		releasedAt: new Date("2026-04-01").getTime(),
		description: "Plan items with max_purchase",
	},
	[ApiVersion.V2_0]: {
		semver: ApiVersion.V2_0,
		calver: "2026-03-31",
		releasedAt: new Date("2026-03-31").getTime(),
		description: "Plan features with max_purchase",
	},
	[ApiVersion.V1_Beta]: {
		semver: ApiVersion.V1_Beta,
		calver: "beta",
		releasedAt: new Date("2025-06-01").getTime(),
		description: "Beta version with experimental features",
	},
	[ApiVersion.V1_2]: {
		semver: ApiVersion.V1_2,
		calver: "2025-05-05",
		releasedAt: new Date("2025-05-05").getTime(),
		description: "Features as object (keyed by feature_id)",
	},
	[ApiVersion.V1_1]: {
		semver: ApiVersion.V1_1,
		calver: "2025-04-17",
		releasedAt: new Date("2025-04-17").getTime(),
		description: "Merged customer response, features as array",
	},
	[ApiVersion.V0_2]: {
		semver: ApiVersion.V0_2,
		calver: "2025-04-01",
		releasedAt: new Date("2025-04-01").getTime(),
		description: "Customer products with items field",
	},
	[ApiVersion.V0_1]: {
		semver: ApiVersion.V0_1,
		calver: "2025-02-01",
		releasedAt: new Date("2025-02-01").getTime(),
		description: "Original customer schema",
	},
};
