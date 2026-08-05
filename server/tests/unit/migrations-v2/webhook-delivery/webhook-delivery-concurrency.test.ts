/**
 * Contract: `webhook_concurrency` is a real ceiling on deliveries in flight.
 *
 * This is the guarantee the setting exists for — it bounds concurrent Svix
 * calls and, more importantly, the DB reads each `customer.products.updated`
 * performs, which is what competes with the hot path during a migration.
 * Trigger.dev caps BATCHES per run (concurrencyKey + limit 1); this covers
 * the fan-out inside one batch.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { MigrationWebhookRecord } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";

const svixModulePath = "@/external/svix/svixHelpers.js";
const productsModulePath =
	"@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
const cusBatchModulePath = "@/internal/customers/CusBatchService.js";
// Snapshot spreads, not live namespaces — after mock.module a namespace's
// bindings retarget to the mock, which would make the afterAll restore
// reinstall the mock instead of the real module.
const realSvix = { ...(await import(svixModulePath)) };
const realProducts = { ...(await import(productsModulePath)) };
const realCusBatch = { ...(await import(cusBatchModulePath)) };

let inFlight = 0;
let peakInFlight = 0;
const deliveredTo: string[] = [];

const trackedSend = async () => {
	inFlight++;
	peakInFlight = Math.max(peakInFlight, inFlight);
	await new Promise((resolve) => setTimeout(resolve, 5));
	inFlight--;
};

mock.module(svixModulePath, () => ({
	...realSvix,
	sendSvixEvent: async ({ data }: { data: { customer_id: string } }) => {
		deliveredTo.push(data.customer_id);
		await trackedSend();
	},
}));
mock.module(productsModulePath, () => ({
	sendProductsUpdated: trackedSend,
}));
// Unit tests never touch the DB — the prefetch returns no customers, so the
// products sender exercises its fetch-fallback path (mocked above).
mock.module(cusBatchModulePath, () => ({
	CusBatchService: { getByInternalIds: async () => [] },
}));

const { sendMigrationWebhooks } = await import(
	"@/internal/migrations/v2/webhookDelivery/sendMigrationWebhooks.js"
);

afterAll(() => {
	mock.module(svixModulePath, () => realSvix);
	mock.module(productsModulePath, () => realProducts);
	mock.module(cusBatchModulePath, () => realCusBatch);
});

const ctx = {
	org: { id: "org_test" },
	env: "sandbox",
	logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
	// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the fan-out path
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

const payloadFor = ({
	records,
	concurrency,
	eventTypes = ["billing.updated"],
}: {
	records: MigrationWebhookRecord[];
	concurrency: number;
	eventTypes?: string[];
}) => ({
	orgId: "org_test",
	env: AppEnv.Sandbox,
	migrationRunId: "run_1",
	concurrency,
	eventTypes,
	records,
});

describe("sendMigrationWebhooks", () => {
	beforeEach(() => {
		inFlight = 0;
		peakInFlight = 0;
		deliveredTo.length = 0;
	});

	test("never exceeds the configured concurrency", async () => {
		await sendMigrationWebhooks({
			ctx,
			payload: payloadFor({ records: buildRecords(40), concurrency: 5 }),
		});

		expect(peakInFlight).toBeLessThanOrEqual(5);
		expect(peakInFlight).toBeGreaterThan(1);
	});

	test("delivers to every customer exactly once", async () => {
		const result = await sendMigrationWebhooks({
			ctx,
			payload: payloadFor({ records: buildRecords(20), concurrency: 4 }),
		});

		expect(result.billingUpdated.delivered).toBe(20);
		expect(result.billingUpdated.failed).toBe(0);
		expect(result.productsUpdated).toEqual({ delivered: 0, failed: 0 });
		expect(new Set(deliveredTo).size).toBe(20);
	});

	test("only sends the event types the org subscribes to", async () => {
		await sendMigrationWebhooks({
			ctx,
			payload: payloadFor({
				records: buildRecords(3),
				concurrency: 2,
				eventTypes: ["customer.products.updated"],
			}),
		});

		// billing.updated is the only sender that records customer ids.
		expect(deliveredTo).toEqual([]);
	});
});
