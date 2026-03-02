import { type AppEnv, AuthType, createdAtToVersion } from "@autumn/shared";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs.js";
import type { DrizzleCli } from "../db/initDrizzle.js";
import type { Logger } from "../external/logtail/logtailUtils.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { OrgService } from "../internal/orgs/OrgService.js";
import { generateId } from "../utils/genUtils.js";

export const createWorkerContext = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: {
		orgId?: string;
		env?: AppEnv;
		customerId?: string;
	};
	logger: Logger;
}) => {
	const { orgId, env, customerId } = payload;
	if (!orgId || !env) return;

	// Fetch org with features once for all items
	const orgData = await OrgService.getWithFeatures({
		db,
		orgId,
		env,
	});

	if (!orgData) {
		throw new Error(`Organization not found: ${orgId}, env: ${env}`);
	}

	const { org, features } = orgData;
	const apiVersion = createdAtToVersion({
		createdAt: org.created_at ?? Date.now(),
	});

	const workerLogger = addAppContextToLogs({
		logger: logger,
		appContext: {
			org_id: org?.id,
			org_slug: org?.slug,
			customer_id: customerId,
			env: env,
			auth_type: AuthType.Worker,
			api_version: apiVersion.semver,
		},
	});

	const ctx: AutumnContext = {
		org,
		env,
		features,
		db,
		logger: workerLogger,

		id: generateId("job"),
		timestamp: Date.now(),
		isPublic: false,
		authType: AuthType.Worker,
		apiVersion,
		expand: [],
		skipCache: true,
		extraLogs: {},
	};

	return ctx;
};
