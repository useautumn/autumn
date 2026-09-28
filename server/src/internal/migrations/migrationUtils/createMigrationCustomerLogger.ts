import { AuthType } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";

export const createMigrationCustomerLogger = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Logger => {
	const { logger, org, env } = ctx;

	return addAppContextToLogs({
		logger: logger,
		appContext: {
			org_id: org.id,
			org_slug: org.slug,
			customer_id: customerId,
			env: env,
			auth_type: AuthType.Worker,
			api_version: ctx.apiVersion?.semver,
		},
	});
};
