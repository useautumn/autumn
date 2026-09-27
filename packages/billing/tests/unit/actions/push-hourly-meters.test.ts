import { describe, expect, test } from "bun:test";
import type { AxiomClient } from "@autumn/axiom";
import { pushHourlyMeters } from "../../../src/actions/pushHourlyMeters/pushHourlyMeters";
import type { TrackItem } from "../../../src/actions/pushHourlyMeters/types/trackItem";
import { apiCallIdempotencyKey } from "../../../src/apiRequests/actions/pushApiCalls/apiCallCountToTrackItem";
import type { AutumnClient } from "../../../src/types/autumnClient";
import { fakeDb, fakeFx, paidRow } from "../paymentVolume/fakes";

const NOW = Date.parse("2026-09-27T12:15:00Z");
const HOUR_11 = "2026-09-27T11:00:00Z";
const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

const fakeAxiom = ({
	rows,
	apls,
}: {
	rows: Record<string, unknown>[];
	apls: string[];
}): AxiomClient =>
	({
		api: {
			query: async (apl: string) => {
				apls.push(apl);
				return {
					tables: [
						{
							name: "0",
							events: function* () {
								yield* rows;
							},
						},
					],
				};
			},
		},
	}) as unknown as AxiomClient;

const fakeAutumn = ({
	batches,
	created,
}: {
	batches: TrackItem[][];
	created: { id: string; name: string }[];
}): AutumnClient => ({
	batchTrack: async ({ items }) => {
		batches.push(items);
		return { accepted: items.length };
	},
	getOrCreateCustomer: async (org) => {
		created.push(org);
	},
});

const run = async ({
	rows,
	invoiceRows = [],
	windows,
}: {
	rows: Record<string, unknown>[];
	invoiceRows?: Record<string, unknown>[];
	windows?: { startMs: number; endMs: number }[];
}) => {
	const apls: string[] = [];
	const batches: TrackItem[][] = [];
	const created: { id: string; name: string }[] = [];
	const ctx = {
		logger: silentLogger,
		axiom: fakeAxiom({ apls, rows }),
		db: fakeDb({ rows: invoiceRows, queries: [] }),
		fx: fakeFx({
			ratesByDate: { "2026-09-27": { EUR: 0.92 } },
			fetchedDates: [],
		}),
		autumn: fakeAutumn({ batches, created }),
	};
	const report = await pushHourlyMeters({ ctx, nowMs: NOW, windows });
	return { report, apls, batches, created };
};

describe("pushHourlyMeters", () => {
	test("orgs are created by slug, then counts become keyed, timestamped items with the endpoint as a property", async () => {
		const { report, apls, batches, created } = await run({
			rows: [
				{
					org_id: "org_a",
					org_slug: "acme",
					hour: HOUR_11,
					endpoint_id: "balances.track",
					requests: 120,
				},
				{
					org_id: "org_a",
					org_slug: "acme",
					hour: HOUR_11,
					endpoint_id: "balances.batch_track",
					requests: "4500",
				},
				{
					org_id: "org_b",
					org_slug: "bolt",
					hour: HOUR_11,
					endpoint_id: "customers.get",
					requests: 7,
				},
			],
		});

		expect(apls).toHaveLength(1);
		expect(apls[0]).toContain(
			"_time >= datetime(2026-09-27T11:00:00.000Z) and _time < datetime(2026-09-27T12:00:00.000Z)",
		);
		expect(created).toEqual([
			{ id: "org_a", name: "acme" },
			{ id: "org_b", name: "bolt" },
		]);
		expect(batches).toHaveLength(1);
		expect(batches[0]).toEqual([
			{
				customerId: "org_a",
				featureId: "api_call",
				value: 120,
				timestampMs: Date.parse(HOUR_11),
				idempotencyKey:
					"api_call:org_a:2026-09-27T11:00:00.000Z:balances.track",
				properties: { endpoint_id: "balances.track" },
			},
			expect.objectContaining({
				customerId: "org_a",
				value: 4500,
				properties: { endpoint_id: "balances.batch_track" },
			}),
			expect.objectContaining({
				customerId: "org_b",
				value: 7,
				idempotencyKey: apiCallIdempotencyKey({
					orgId: "org_b",
					hourStartMs: Date.parse(HOUR_11),
					endpointId: "customers.get",
				}),
			}),
		]);
		expect(report).toMatchObject({
			orgs: 2,
			apiCalls: { counts: 3, pushed: 3, failed: 0, errors: [] },
			paymentVolume: { invoices: 0, pushed: 0 },
		});
		expect(report.windows).toHaveLength(1);
	});

	test("paid invoices ride the same run: their orgs are created and usd_volume is pushed in its own batch", async () => {
		const { report, batches, created } = await run({
			rows: [],
			invoiceRows: [
				paidRow({ org_id: "org_c", org_slug: "cobalt" }),
				paidRow({
					id: "inv_2",
					stripe_id: "in_2",
					org_id: "org_c",
					org_slug: "cobalt",
					currency: "eur",
					amount: 100,
				}),
			],
		});

		expect(created).toEqual([{ id: "org_c", name: "cobalt" }]);
		expect(batches).toHaveLength(1);
		expect(batches[0].map((item) => [item.featureId, item.value])).toEqual([
			["usd_volume", 375],
			["usd_volume", 108.7],
		]);
		expect(report).toMatchObject({
			orgs: 1,
			apiCalls: { counts: 0, pushed: 0 },
			paymentVolume: { invoices: 2, skipped: 0, pushed: 2, failed: 0 },
		});
	});

	test("explicit windows drive a backfill", async () => {
		const windows = [
			{
				startMs: Date.parse("2026-09-01T00:00:00Z"),
				endMs: Date.parse("2026-09-01T01:00:00Z"),
			},
		];
		const { report, apls, created } = await run({ rows: [], windows });
		expect(apls[0]).toContain(
			"_time >= datetime(2026-09-01T00:00:00.000Z) and _time < datetime(2026-09-01T01:00:00.000Z)",
		);
		expect(created).toEqual([]);
		expect(report).toMatchObject({
			orgs: 0,
			apiCalls: { counts: 0, pushed: 0 },
			windows,
		});
	});

	test("a row with an unknown endpoint fails the run instead of being guessed", async () => {
		await expect(
			run({
				rows: [
					{
						org_id: "org_a",
						org_slug: "acme",
						hour: HOUR_11,
						endpoint_id: "billing.attach",
						requests: 1,
					},
				],
			}),
		).rejects.toThrow();
	});
});
