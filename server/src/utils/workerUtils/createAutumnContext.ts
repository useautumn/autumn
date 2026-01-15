import {
	type AppEnv,
	AuthType,
	createdAtToVersion,
	ErrCode,
	RecaseError,
} from "@autumn/shared";

import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const createWorkerAutumnContext = async ({
	db,
	orgId,
	env,
	logger,
	workerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	logger: Logger;
	workerId: string;
}): Promise<AutumnContext> => {
	// 1. Get org with features
	const data = await OrgService.getWithFeatures({
		db,
		orgId,
		env,
	});

	if (!data) {
		logger.warn(`Org ${orgId} not found in DB`);
		throw new RecaseError({
			message: "Org not found",
			code: ErrCode.OrgNotFound,
			statusCode: 500,
		});
	}

	const { org, features } = data;

	const apiVersion = createdAtToVersion({
		createdAt: org.created_at || Date.now(),
	});

	return {
		org,
		env,
		features,

		db,
		logger,
		expand: [],

		id: workerId,
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion,
		timestamp: Date.now(),
		skipCache: false,
		extraLogs: {},
	} satisfies AutumnContext;
};
