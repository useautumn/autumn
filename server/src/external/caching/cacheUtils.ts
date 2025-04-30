import { notNullish } from "@/utils/genUtils.js";
import { CacheManager } from "./CacheManager.js";

export async function getAPIKeyCache({
  action,
  key,
  fn,
}: {
  action: string;
  key: string;
  fn: () => Promise<any>;
}) {
  let cacheKey = `${action}:${key}`;
  // Try to get from cache
  try {
    const cachedResult = await CacheManager.getJson(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
  } catch (error) {}

  // Cache miss, call original function

  const data = await fn();

  try {
    if (notNullish(data)) {
      await CacheManager.setJson(cacheKey, data, 3600);
    }
  } catch (error) {
    console.error("Failed to set cache:", error);
  }

  return data;
}
