import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	addAppContextToLogs,
	addExtrasToLogs,
} from "@/utils/logging/addContextToLogs.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	isPersistedMigration,
	type MigrationRuntime,
} from "../../../types/migrationDefinition.js";

export const createMigrateCustomerRunContext = ({
	ctx,
	customerId,
	migration,
	preview,
}: {
	ctx: AutumnContext;
	customerId: string;
	migration: MigrationRuntime;
	preview: boolean;
}): AutumnContext => {
	const migrationCtx: AutumnContext = {
		...ctx,
		customerId,
		entityId: undefined,
		timestamp: Date.now(),
		extraLogs: {},
		// Migration setup should read source-of-truth customer state from DB.
		// Execute still invalidates cache after writes.
		skipCache: true,
	};

	migrationCtx.logger = addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: ctx.authType,
			customer_id: customerId,
			user_id: ctx.userId || undefined,
			user_email: ctx.user?.email || undefined,
			api_version: ctx.apiVersion?.semver,
			scopes: ctx.scopes,
		},
	});
	migrationCtx.logger = addExtrasToLogs({
		logger: migrationCtx.logger,
		extras: {},
	});
	addToExtraLogs({
		ctx: migrationCtx,
		extras: {
			migrationCustomer: {
				migrationId: migration.id,
				migrationInternalId: isPersistedMigration(migration)
					? migration.internal_id
					: undefined,
				preview,
			},
		},
	});

	return migrationCtx;
};
