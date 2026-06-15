import { RecaseError } from "@autumn/shared";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isTransientDbError } from "./dbUtils.js";

export const shed503OnTransientError = async <T>({
	ctx,
	source,
	run,
}: {
	ctx: AutumnContext;
	source: string;
	run: () => T | Promise<T>;
}): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		if (!(isTransientDbError({ error }) || isTransientRedisError({ error }))) {
			throw error;
		}
		ctx.logger.warn(`[${source}] transient DB error, shedding with 503`, {
			type: `${source}_fail_open`,
			error,
		});
		throw new RecaseError({
			message: "Service is temporarily unavailable, please retry shortly.",
			code: "service_unavailable",
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});
	}
};
