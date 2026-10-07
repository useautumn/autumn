import type { Context, Next } from "hono";
import {
	TW_TEST_FILE_HEADER,
	withTwStripeFileTag,
} from "@/external/connect/clientCache/twStripeLimiter/twStripeRequestContext.js";

/** bun tw only: Stripe calls made while serving a test's request count against that test file. */
export const twTestFileMiddleware = (c: Context, next: Next) =>
	withTwStripeFileTag({
		fileTag: c.req.header(TW_TEST_FILE_HEADER),
		run: next,
	});
