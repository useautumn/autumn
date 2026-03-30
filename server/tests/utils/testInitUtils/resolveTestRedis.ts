import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { TestContext } from "./createTestContext.js";

/** Returns a shallow copy of ctx with redis resolved for the given customer.
 *  Mirrors what orgRedisMiddleware does for HTTP requests.
 *  Returns a copy so the shared singleton ctx is never mutated. */
export const resolveTestRedis = ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): TestContext => {
	return {
		...ctx,
		redis: resolveRedisForCustomer({
			org: ctx.org,
			customerId,
		}),
	};
};
