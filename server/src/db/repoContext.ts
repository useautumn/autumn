import type { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { DrizzleCli } from "./initDrizzle.js";

export interface RepoContext {
	org: {
		id: string;
	};
	env: AppEnv;

	db: DrizzleCli;
	logger: Logger;
	redis: Redis;
	customerId?: string;
}
