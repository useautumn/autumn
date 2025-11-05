import { notNullish } from "@autumn/shared";
import { CacheManager } from "./CacheManager.js";

export async function queryWithCache({
	key,
	fn,
	ttl,
}: {
	key: string;
	fn: () => Promise<any>;
	ttl?: number;
}) {
	const cachedResult = await CacheManager.getJson(key);

	if (cachedResult) return cachedResult;

	const data = await fn();

	if (notNullish(data)) {
		await CacheManager.setJson(key, data, ttl);
	}

	return data;
}
