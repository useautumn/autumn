/**
 * Contract: how a page's records become queue messages.
 *
 *   - delivery OFF (or unresolved controls) → nothing queued, whatever the
 *     records — this is the operator's off-switch and must short-circuit
 *     before any send is attempted;
 *   - zero records → nothing queued;
 *   - records split into MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE batches, with
 *     every record landing in exactly one.
 */

import { describe, expect, test } from "bun:test";
import type { MigrationWebhookRecord } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";
import { MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE } from "@/internal/migrations/v2/webhookDelivery/utils/migrationWebhookDeliveryQueue.js";
import {
	chunkWebhookRecords,
	queueMigrationWebhooks,
} from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";

const ctx = {
	org: { id: "org_test" },
	env: "sandbox",
	logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
	// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the off-switch path
} as any;

const buildRecords = (count: number): MigrationWebhookRecord[] =>
	Array.from({ length: count }, (_, index) => ({
		customerId: `customer-${index}`,
		internalCustomerId: `cus_internal_${index}`,
		entityId: null,
		customerProductIds: [`cp_${index}`],
		planChanges: [
			{ action: "updated" as const, previous_attributes: {}, item_changes: [] },
		],
	}));

describe("chunkWebhookRecords", () => {
	test("splits into fixed-size batches, losing nothing", () => {
		const records = buildRecords(MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE * 2 + 7);
		const batches = chunkWebhookRecords({ records });

		expect(batches).toHaveLength(3);
		expect(batches[0]).toHaveLength(MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE);
		expect(batches[2]).toHaveLength(7);
		expect(batches.flat().map((record) => record.customerId)).toEqual(
			records.map((record) => record.customerId),
		);
	});

	test("an exact multiple produces no trailing empty batch", () => {
		expect(
			chunkWebhookRecords({
				records: buildRecords(MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE * 2),
			}),
		).toHaveLength(2);
	});

	test("no records → no batches", () => {
		expect(chunkWebhookRecords({ records: [] })).toEqual([]);
	});
});

describe("queueMigrationWebhooks", () => {
	test("queues nothing when delivery is off", async () => {
		expect(
			await queueMigrationWebhooks({
				ctx,
				migrationRunId: "run_1",
				controls: {
					sendWebhooks: false,
					webhookConcurrency: 10,
					eventTypes: ["billing.updated"],
				},
				records: buildRecords(10),
			}),
		).toBe(0);
	});

	test("queues nothing when controls were never resolved", async () => {
		expect(
			await queueMigrationWebhooks({
				ctx,
				migrationRunId: "run_1",
				controls: undefined,
				records: buildRecords(10),
			}),
		).toBe(0);
	});

	test("queues nothing when there are no records", async () => {
		expect(
			await queueMigrationWebhooks({
				ctx,
				migrationRunId: "run_1",
				controls: {
					sendWebhooks: true,
					webhookConcurrency: 10,
					eventTypes: ["billing.updated"],
				},
				records: [],
			}),
		).toBe(0);
	});
});
