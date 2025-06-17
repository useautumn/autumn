import { logger } from "../logtail/logtailUtils.js";

export function safeResend<T extends (...args: any[]) => any>({
  fn,
  action,
}: {
  fn: T;
  action: string;
}): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
  return async (...args: Parameters<T>) => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_DOMAIN) {
      logger.warn(
        `RESEND_API_KEY or RESEND_DOMAIN is not set, skipping ${action}`,
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
