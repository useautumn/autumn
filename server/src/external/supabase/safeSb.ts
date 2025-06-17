import { logger } from "../logtail/logtailUtils.js";

export function safeSb<T extends (...args: any[]) => any>({
  fn,
  action,
}: {
  fn: T;
  action: string;
}): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
  return async (...args: Parameters<T>) => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      logger.warn(
        `SUPABASE_URL or SUPABASE_SERVICE_KEY is not set, skipping ${action}`,
      );
      return;
    }
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error ${action}: ${error}`);
    }
  };
}
