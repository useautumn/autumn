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

import { describe, expect, spyOn, test } from "bun:test";
import { withTimeout } from "@autumn/shared";
import { auth } from "@trigger.dev/sdk/v3";
import { BATCH_MIGRATION_PAGE_TIMEOUT_MS } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import type { MigrationWebhookRecord } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";
import { MIGRATION_WEBHOOK_RECORDS_PER_MESSAGE } from "@/internal/migrations/v2/webhookDelivery/utils/migrationWebhookDeliveryQueue.js";
import {
	chunkWebhookRecords,
	queueMigrationWebhooks,
} from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";
import * as triggerConfig from "@/trigger/configureTrigger.js";

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
			{
				action: "updated" as const,
				previous_attributes: null,
				item_changes: [],
			},
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
	test.each([false, true])(
		"a full page fits the deadline with slow SDK requests (stream fails: %p)",
		async (streamFails) => {
			// Scale four-second HTTP latency and the five-minute page deadline together.
			const timeScale = 100;
			const requestDelayMs = 4_000 / timeScale;
			const records = buildRecords(5_000);
			const requests: string[] = [];
			const submittedItems: {
				payload: string;
				options: {
					concurrencyKey: string;
					idempotencyKey: string;
					idempotencyKeyTTL: string;
				};
			}[] = [];
			const configured = spyOn(
				triggerConfig,
				"isTriggerConfigured",
			).mockReturnValue(true);
			const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
				Object.assign(
					async (
						input: Parameters<typeof fetch>[0],
						init: Parameters<typeof fetch>[1],
					) => {
						const url = String(input);
						if (!url.startsWith("https://trigger.test/"))
							throw new Error("Unexpected external request");
						requests.push(url);
						await Bun.sleep(requestDelayMs);
						if (url.endsWith("/tasks/send-migration-webhooks/trigger")) {
							return Response.json(
								{ id: `run_test_${requests.length}`, isCached: false },
								{
									headers: { "x-trigger-jwt": "unit-test" },
								},
							);
						}
						if (url.endsWith("/api/v3/batches")) {
							expect(JSON.parse(String(init?.body)).runCount).toBe(100);
							return Response.json(
								{ id: "batch_test", runCount: 100, isCached: false },
								{
									headers: { "x-trigger-jwt": "unit-test" },
								},
							);
						}
						expect(url).toBe(
							"https://trigger.test/api/v3/batches/batch_test/items",
						);
						const body = await new Response(init?.body).text();
						submittedItems.push(
							...body
								.trim()
								.split("\n")
								.map((line) => JSON.parse(line)),
						);
						return streamFails
							? Response.json(
									{ message: "submission rejected" },
									{ status: 400 },
								)
							: Response.json({
									id: "batch_test",
									itemsAccepted: 100,
									itemsDeduplicated: 0,
									sealed: true,
								});
					},
					{ preconnect: () => {} },
				),
			);

			const submission = auth.withAuth(
				{ baseURL: "https://trigger.test", secretKey: "tr_dev_unit_test" },
				() =>
					queueMigrationWebhooks({
						ctx,
						migrationRunId: "run_1",
						records,
						controls: {
							sendWebhooks: true,
							webhookConcurrency: 1,
							eventTypes: ["billing.updated"],
						},
					}),
			);
			try {
				const queued = withTimeout({
					fn: () => submission,
					timeoutMs: BATCH_MIGRATION_PAGE_TIMEOUT_MS / timeScale,
				});
				if (streamFails)
					await expect(queued).rejects.toThrow("Failed to stream items");
				else expect(await queued).toBe(100);
				expect(requests).toHaveLength(2);
				expect(submittedItems).toHaveLength(100);
				const submittedRecords = submittedItems.flatMap((item, index) => {
					const payload = JSON.parse(item.payload).json;
					expect(payload.records).toHaveLength(50);
					expect(payload.concurrency).toBe(1);
					expect(item.options).toMatchObject({
						concurrencyKey: "run_1",
						idempotencyKeyOptions: {
							key: `migration-webhooks:run_1:customer-0:${index}`,
							scope: "run",
						},
						idempotencyKeyTTL: "7d",
					});
					return payload.records;
				});
				expect(submittedRecords).toEqual(records);
			} finally {
				await submission.catch(() => {});
				fetchMock.mockRestore();
				configured.mockRestore();
			}
		},
	);

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
