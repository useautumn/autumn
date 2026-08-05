import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";

// AWS region this instance runs in — used only as a telemetry/client label.
export const currentRegion = process.env.AWS_REGION || DEFAULT_AWS_REGION;

export const miscRedisUrl = process.env.CACHE_URL?.trim();

export const hasMiscRedisConfig = Boolean(miscRedisUrl);
