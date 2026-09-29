import { describe, expect, test } from "bun:test";
import type { TrackItem } from "../../../src/actions/pushHourlyMeters/types/trackItem";
import { pushPaymentVolume } from "../../../src/paymentVolume/actions/pushPaymentVolume/pushPaymentVolume";
import type { PaidInvoice } from "../../../src/paymentVolume/types/paidInvoice";
import { emptyAxiom, fakeAutumn, fakeFx, silentLogger } from "./fakes";

const PAID_SEP_27 = Date.parse("2026-09-27T11:20:00Z");
const PAID_SEP_26 = Date.parse("2026-09-26T23:50:00Z");

const invoice = (overrides: Partial<PaidInvoice> = {}): PaidInvoice => ({
	id: "inv_1",
	stripeId: "in_1",
	processorType: "stripe",
	orgId: "org_a",
	orgSlug: "acme",
	currency: "usd",
	amount: 375,
	paidAtMs: PAID_SEP_27,
	...overrides,
});

const run = async ({
	invoices,
	ratesByDate = { "2026-09-27": { EUR: 0.92, JPY: 150 } },
}: {
	invoices: PaidInvoice[];
	ratesByDate?: Record<string, Record<string, number>>;
}) => {
	const batches: TrackItem[][] = [];
	const fetchedDates: string[] = [];
	const ctx = {
		logger: silentLogger,
		axiom: emptyAxiom(),
		db: { execute: async () => [] },
		fx: fakeFx({ ratesByDate, fetchedDates }),
		autumn: fakeAutumn({ batches, created: [] }),
	};
	const report = await pushPaymentVolume({ ctx, invoices });
	return { report, batches, fetchedDates };
};

describe("pushPaymentVolume", () => {
	test("each paid invoice becomes a USD item keyed by invoice, stamped with paid_at and its rate", async () => {
		const { report, batches } = await run({
			invoices: [
				invoice(),
				invoice({
					id: "inv_2",
					stripeId: "in_2",
					currency: "eur",
					amount: 100,
					processorType: null,
				}),
			],
		});

		expect(batches).toHaveLength(1);
		expect(batches[0]).toEqual([
			{
				customerId: "org_a",
				featureId: "usd_volume",
				value: 375,
				timestampMs: PAID_SEP_27,
				idempotencyKey: "usd_volume:inv_1",
				properties: {
					invoice_id: "inv_1",
					stripe_id: "in_1",
					processor_type: "stripe",
					currency: "usd",
					amount: 375,
					rate_code: "USD",
					rate: 1,
					rate_date: "2026-09-27",
					source: "openexchangerates",
				},
			},
			expect.objectContaining({
				value: 108.7,
				idempotencyKey: "usd_volume:inv_2",
				properties: expect.objectContaining({
					currency: "eur",
					amount: 100,
					rate: 0.92,
				}),
			}),
		]);
		expect(batches[0][1].properties).not.toHaveProperty("processor_type");
		expect(report).toEqual({
			invoices: 2,
			skipped: 0,
			pushed: 2,
			failed: 0,
			errors: [],
		});
	});

	test("one rate table per paid_at day, fetched before anything is sent", async () => {
		const { fetchedDates, batches } = await run({
			invoices: [
				invoice(),
				invoice({
					id: "inv_2",
					paidAtMs: PAID_SEP_26,
					currency: "jpy",
					amount: 1500,
				}),
				invoice({ id: "inv_3", paidAtMs: PAID_SEP_26 }),
			],
			ratesByDate: {
				"2026-09-27": { EUR: 0.92 },
				"2026-09-26": { JPY: 150 },
			},
		});
		expect(fetchedDates.sort()).toEqual(["2026-09-26", "2026-09-27"]);
		expect(batches[0].map((item) => item.value)).toEqual([375, 10, 375]);
	});

	test("nothing collected is skipped and counted, never sent as 0", async () => {
		const { report, batches } = await run({
			invoices: [invoice({ amount: 0 }), invoice({ id: "inv_2", amount: -5 })],
		});
		expect(batches).toEqual([]);
		expect(report).toMatchObject({ invoices: 2, skipped: 2, pushed: 0 });
	});

	test("a missing rate fails the run and batch_track is never called", async () => {
		const batches: TrackItem[][] = [];
		const ctx = {
			logger: silentLogger,
			axiom: emptyAxiom(),
			db: { execute: async () => [] },
			fx: fakeFx({
				ratesByDate: { "2026-09-27": { EUR: 0.92 } },
				fetchedDates: [],
			}),
			autumn: fakeAutumn({ batches, created: [] }),
		};
		await expect(
			pushPaymentVolume({
				ctx,
				invoices: [invoice(), invoice({ id: "inv_2", currency: "gbp" })],
			}),
		).rejects.toThrow("No usable GBP rate");
		expect(batches).toEqual([]);
	});

	test("a day the provider cannot serve fails the run before any push", async () => {
		const batches: TrackItem[][] = [];
		const ctx = {
			logger: silentLogger,
			axiom: emptyAxiom(),
			db: { execute: async () => [] },
			fx: fakeFx({ ratesByDate: {}, fetchedDates: [] }),
			autumn: fakeAutumn({ batches, created: [] }),
		};
		await expect(
			pushPaymentVolume({ ctx, invoices: [invoice({ currency: "eur" })] }),
		).rejects.toThrow("not_available");
		expect(batches).toEqual([]);
	});
});
