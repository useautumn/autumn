import { AuthType } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const createMigrationCustomerLogger = ({
	ctx,
	customerId,
	migrationJobId,
}: {
	ctx: AutumnContext;
	customerId: string;
	migrationJobId?: string;
}): Logger => {
	const { logger, org, env } = ctx;

	return logger.child({
		context: {
			context: {
				migration_job_id: migrationJobId,
				org_id: org.id,
				org_slug: org.slug,
				customer_id: customerId,
				env: env,
				authType: AuthType.Worker,
			},
		},
	});
};
