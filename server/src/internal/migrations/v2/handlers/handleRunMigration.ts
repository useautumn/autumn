import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { idempotencyKeys } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import {
	getRunMigrationIdempotencyKey,
	runMigrationTask,
} from "@/trigger/migrations/runMigrationTask.js";

const RunMigrationBody = z.object({
	id: z.string(),
	dry_run: z.boolean().default(false),
});

const getRunMigrationTriggerOptions = ({
	orgId,
	isDev,
	idempotencyKey,
}: {
	orgId: string;
	isDev: boolean;
	idempotencyKey: string;
}) => ({
	...(isDev ? { region: "eu-west-1" } : {}),
	concurrencyKey: orgId,
	idempotencyKey,
	idempotencyKeyTTL: "6h",
});

const isCachedRunHandle = (
	handle: Awaited<ReturnType<typeof runMigrationTask.trigger>>,
) => (handle as { isCached?: boolean }).isCached === true;

export const handleRunMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: RunMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id, dry_run: dryRun } = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to run`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		const isDev = process.env.NODE_ENV === "development";
		const idempotencyKey = await idempotencyKeys.create(
			getRunMigrationIdempotencyKey({ orgId: ctx.org.id, env: ctx.env }),
			{ scope: "global" },
		);

		const handle = await runMigrationTask.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				migrationId: id,
				dryRun,
			},
			getRunMigrationTriggerOptions({
				orgId: ctx.org.id,
				isDev,
				idempotencyKey,
			}),
		);

		if (isCachedRunHandle(handle)) {
			throw new RecaseError({
				message:
					"A migration is already running. Please try again when it completes.",
				code: ErrCode.MigrationAlreadyInProgress,
				statusCode: 409,
			});
		}

		return c.json({
			migration_id: id,
			dry_run: dryRun,
			run_id: handle.id,
		});
	},
});
