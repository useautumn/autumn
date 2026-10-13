/** The AWS regions an Atom can be set up in; each one offers the Graviton machines in `BYOC_CACHE_MACHINES`. */
export const BYOC_CACHE_AWS_REGIONS = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ca-central-1",
	"sa-east-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-central-1",
	"eu-north-1",
	"ap-south-1",
	"ap-southeast-1",
	"ap-southeast-2",
	"ap-northeast-1",
	"ap-northeast-2",
] as const;

export type ByocCacheAwsRegion = (typeof BYOC_CACHE_AWS_REGIONS)[number];

export const DEFAULT_BYOC_CACHE_AWS_REGION: ByocCacheAwsRegion = "us-east-1";
