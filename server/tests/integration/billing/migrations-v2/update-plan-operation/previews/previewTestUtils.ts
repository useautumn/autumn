import type { Migration } from "@autumn/shared";
import type {
	CustomerPlanChange,
	CustomerPlanItemChange,
} from "@autumn/shared/api/billing/common/customerPlanChange.js";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { logMigrationPreview } from "./expectMigrationPreviewCorrect";

type MigrationItemEvent = {
	status: string;
	dry_run: boolean;
	item_id: string;
	response: unknown;
};

type MigrationClient = {
	migrationsV2: {
		deleteAndCreate: (params: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
			no_billing_changes?: boolean;
		}) => Promise<Migration>;
		run: (params: { id: string; dry_run?: boolean }) => Promise<{
			migration_id: string;
			dry_run: boolean;
			run_id: string;
		}>;
		listItemEvents: (params: {
			migrationId: string;
			migrationRunId?: string;
		}) => Promise<{ list: MigrationItemEvent[] }>;
	};
};

export type PreviewPlanItemChange = CustomerPlanItemChange;

export type PreviewPlanChange = CustomerPlanChange;

export type PreviewBalanceChange = {
	feature_id: string;
	balance: {
		granted: number;
		remaining: number;
		usage: number;
		unlimited: boolean;
		next_reset_at: number | null;
	};
	previous_attributes: Record<string, unknown>;
};

export type PreviewMigrateCustomer = {
	object: "migration_customer_preview";
	customer_id: string;
	plan_changes: PreviewPlanChange[];
	balance_changes: PreviewBalanceChange[];
	flag_changes: PreviewFlagChange[];
};

export type PreviewFlagChange = {
	action: "created" | "deleted";
	feature_id: string;
};

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const parseResponse = (response: unknown): Record<string, unknown> => {
	if (typeof response === "string") return JSON.parse(response);
	if (response && typeof response === "object")
		return response as Record<string, unknown>;
	throw new Error(`Invalid migration event response: ${String(response)}`);
};

export const waitForPreview = async ({
	autumn,
	migrationId,
	migrationRunId,
	timeoutMs = 45_000,
	log = true,
}: {
	autumn: MigrationClient;
	migrationId: string;
	migrationRunId: string;
	timeoutMs?: number;
	log?: boolean;
}): Promise<PreviewMigrateCustomer> => {
	const start = Date.now();
	let lastError: unknown;

	while (Date.now() - start < timeoutMs) {
		try {
			const events = await autumn.migrationsV2.listItemEvents({
				migrationId,
				migrationRunId,
			});
			const event = events.list[0];
			if (!event) throw new Error("No migration item event found");
			const response = parseResponse(event.response);
			const preview = response.preview;
			if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
				throw new Error("Migration item event missing structured preview");
			}
			const typedPreview = preview as PreviewMigrateCustomer;
			logMigrationPreview({ preview: typedPreview, log });
			return typedPreview;
		} catch (error) {
			lastError = error;
			await timeout(1_000);
		}
	}

	throw new Error(
		`Timed out waiting for migration preview: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};

export const runUpdatePlanPreview = async ({
	autumn,
	migrationId,
	filter,
	operations,
	noBillingChanges,
	log = true,
}: {
	autumn: MigrationClient;
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
	noBillingChanges?: boolean;
	log?: boolean;
}): Promise<PreviewMigrateCustomer> => {
	const migration = await autumn.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
		no_billing_changes: noBillingChanges,
	});
	const runResponse = await autumn.migrationsV2.run({
		id: migration.id,
		dry_run: true,
	});

	return waitForPreview({
		autumn,
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
		log,
	});
};
