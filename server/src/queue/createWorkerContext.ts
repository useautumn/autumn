import { type AppEnv, AuthType, createdAtToVersion } from "@autumn/shared";
import type { DrizzleCli } from "../db/initDrizzle.js";
import type { Logger } from "../external/logtail/logtailUtils.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { OrgService } from "../internal/orgs/OrgService.js";
import { generateId } from "../utils/genUtils.js";

export const createWorkerContext = async ({
	db,
	payload,
	logger,
	workflowId,
}: {
	db: DrizzleCli;
	payload: {
		orgId?: string;
		env?: AppEnv;
		customerId?: string;
	};
	logger: Logger;
	workflowId?: string;
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

	const workerLogger = logger.child({
		context: {
			context: {
				workflow_id: workflowId,
				org_id: org?.id,
				org_slug: org?.slug,
				customer_id: customerId,
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

		id: workflowId || generateId("job"),
		timestamp: Date.now(),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: createdAtToVersion({ createdAt: org.created_at! }),
		clickhouseClient: undefined,
		expand: [],
		skipCache: true,
	};

	return ctx;
};
