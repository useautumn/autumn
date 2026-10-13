import {
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
} from "@autumn/shared";

const AWS_REGION_NAMES: Record<ByocCacheAwsRegion, string> = {
	"us-east-1": "US East (N. Virginia)",
	"us-east-2": "US East (Ohio)",
	"us-west-1": "US West (N. California)",
	"us-west-2": "US West (Oregon)",
	"ca-central-1": "Canada (Central)",
	"sa-east-1": "South America (São Paulo)",
	"eu-west-1": "Europe (Ireland)",
	"eu-west-2": "Europe (London)",
	"eu-west-3": "Europe (Paris)",
	"eu-central-1": "Europe (Frankfurt)",
	"eu-north-1": "Europe (Stockholm)",
	"ap-south-1": "Asia Pacific (Mumbai)",
	"ap-southeast-1": "Asia Pacific (Singapore)",
	"ap-southeast-2": "Asia Pacific (Sydney)",
	"ap-northeast-1": "Asia Pacific (Tokyo)",
	"ap-northeast-2": "Asia Pacific (Seoul)",
};

const isAwsRegion = (region: string): region is ByocCacheAwsRegion =>
	(BYOC_CACHE_AWS_REGIONS as readonly string[]).includes(region);

/** The region as AWS's console names it, e.g. "AWS · Europe (London)". */
export const awsRegionLabel = (region: string) =>
	["AWS", isAwsRegion(region) && AWS_REGION_NAMES[region]]
		.filter(Boolean)
		.join(" · ");
