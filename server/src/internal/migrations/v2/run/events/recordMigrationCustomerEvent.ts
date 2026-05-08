import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MigrationCustomerEvent,
	MigrationCustomerEventInput,
} from "./migrationCustomerEventTypes.js";
import { sendMigrationCustomerEventsToTinybird } from "./sendMigrationCustomerEvents.js";

/** Enriches and records one migration lifecycle event. */
export const recordMigrationCustomerEvent = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	eventType,
	internalCustomerId,
	customerId,
	details,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
} & MigrationCustomerEventInput): Promise<void> => {
	const event: MigrationCustomerEvent = {
		eventType,
		internalCustomerId,
		customerId,
		details,
		orgId: ctx.org.id,
		env: ctx.env,
		migrationId: migration.id,
		migrationRunId,
		dryRun,
	};

	await sendMigrationCustomerEventsToTinybird({
		events: [event],
		logger: ctx.logger,
	});
};
