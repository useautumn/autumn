// Region constants
const REGION_US_EAST_2 = "us-east-2";
const REGION_US_WEST_2 = "us-west-2";

// All configured regions
const ALL_REGIONS = [REGION_US_EAST_2, REGION_US_WEST_2] as const;

// Current region this instance is running in
export const currentRegion = process.env.AWS_REGION || REGION_US_WEST_2;

export const cacheBackupUrl = process.env.CACHE_BACKUP_URL?.trim();

// The backup is edge-selected unless it is the only configured Redis endpoint.
const regionToCacheUrl: Record<string, string | undefined> = {
	[REGION_US_EAST_2]: process.env.CACHE_URL_US_EAST,
	[REGION_US_WEST_2]: process.env.CACHE_URL,
};
const hasPrimaryCacheUrls = Object.values(regionToCacheUrl).some(Boolean);

export const primaryCacheUrl =
	regionToCacheUrl[currentRegion] || process.env.CACHE_URL || cacheBackupUrl;

export const hasRedisConfig = Boolean(primaryCacheUrl);

/** Get all regions that have configured cache URLs */
export const getConfiguredRegions = (): string[] => {
	const configured = ALL_REGIONS.filter((region) => regionToCacheUrl[region]);
	return hasPrimaryCacheUrls || !cacheBackupUrl ? configured : [...ALL_REGIONS];
};

export const getCacheUrlForRegion = ({ region }: { region: string }) => {
	return (
		regionToCacheUrl[region] ||
		(!hasPrimaryCacheUrls ? cacheBackupUrl : undefined)
	);
};

export const PRIMARY_REGION = REGION_US_WEST_2;
