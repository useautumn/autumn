import type { DrizzleCli } from "../../db/initDrizzle";
import type { Logger } from "../../external/logtail/logtailUtils";

export interface CronContext {
	db: DrizzleCli;
	logger: Logger;
}
