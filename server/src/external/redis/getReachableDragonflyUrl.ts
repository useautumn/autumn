import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";

export const getReachableDragonflyUrl = (url: string): string => {
	if (onAwsEcs()) return url;

	const privateUrl = process.env.CACHE_V2_DRAGONFLY_URL?.trim();
	if (!privateUrl || url.trim() !== privateUrl) return url;

	const publicUrl = process.env.CACHE_V2_DRAGONFLY_PUBLIC_URL?.trim();
	if (!publicUrl) return url;

	return publicUrl;
};
