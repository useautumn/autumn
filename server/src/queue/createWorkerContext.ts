import { type AppEnv, AuthType, createdAtToVersion } from "@autumn/shared";
import type { DrizzleCli } from "../db/initDrizzle.js";
import type { Logger } from "../external/logtail/logtailUtils.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { OrgService } from "../internal/orgs/OrgService.js";
import { generateId } from "../utils/genUtils.js";

export const createWorkerContext = async ({
	db,
	orgId,
	env,
	logger,
	workflowId,
}: {
	db: DrizzleCli;
	orgId?: string;
	env?: AppEnv;
	logger: Logger;
	workflowId?: string;
}) => {
	if (!orgId || !env) return;

	// Fetch org with features once for all items
	const orgData = await OrgService.getWithFeatures({
		db,
		orgId,
		env: env as AppEnv,
	});

	if (!orgData) {
		throw new Error(`Organization not found: ${orgId}, env: ${env}`);
	}

	const { org, features } = orgData;

	const workerLogger = logger.child({
		context: {
			context: {
				workflow_id: workflowId,
				org_id: org?.id,
				org_slug: org?.slug,
				env: env,
				authType: AuthType.Worker,
			},
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
		authType: AuthType.Unknown,
		apiVersion: createdAtToVersion({ createdAt: org.created_at! }),
		clickhouseClient: null as any,
		expand: [],
		skipCache: true,
	};

	return ctx;
};
