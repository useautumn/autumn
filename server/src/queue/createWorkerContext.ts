import {
	type AppEnv,
	AuthType,
	createdAtToVersion,
	type Feature,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "../db/initDrizzle.js";
import type { Logger } from "../external/logtail/logtailUtils.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { generateId } from "../utils/genUtils.js";

export const createWorkerContext = ({
	db,
	org,
	env,
	features,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	features: Feature[];
	logger: Logger;
}) => {
	const ctx: AutumnContext = {
		org,
		env,
		features,
		db,
		logger,

		id: generateId("job"),
		timestamp: Date.now(),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: createdAtToVersion({ createdAt: org.created_at! }),
		clickhouseClient: null as any,
	};

	return ctx;
};
