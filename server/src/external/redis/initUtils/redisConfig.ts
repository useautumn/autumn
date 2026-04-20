// Region constants
const REGION_US_EAST_2 = "us-east-2";
const REGION_US_WEST_2 = "us-west-2";

// All configured regions
const ALL_REGIONS = [REGION_US_EAST_2, REGION_US_WEST_2] as const;

// Current region this instance is running in
export const currentRegion = process.env.AWS_REGION || REGION_US_WEST_2;

export const cacheBackupUrl = process.env.CACHE_BACKUP_URL?.trim();

// Map of region to cache URL. When CACHE_BACKUP_URL is set, all regions use it
// (failover / single backup endpoint).
const regionToCacheUrl: Record<string, string | undefined> = cacheBackupUrl
	? {
			[REGION_US_EAST_2]: cacheBackupUrl,
			[REGION_US_WEST_2]: cacheBackupUrl,
		}
	: {
			[REGION_US_EAST_2]: process.env.CACHE_URL_US_EAST,
			[REGION_US_WEST_2]: process.env.CACHE_URL,
		};

export const primaryCacheUrl =
	regionToCacheUrl[currentRegion] || process.env.CACHE_URL || cacheBackupUrl;

/** Get all regions that have configured cache URLs */
export const getConfiguredRegions = (): string[] => {
	return ALL_REGIONS.filter((region) => regionToCacheUrl[region]);
};

export const getCacheUrlForRegion = ({ region }: { region: string }) => {
	return regionToCacheUrl[region];
};

export const PRIMARY_REGION = REGION_US_WEST_2;
