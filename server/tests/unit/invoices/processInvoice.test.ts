import { describe, expect, test } from "bun:test";
import { type Invoice, ProcessorType } from "@autumn/shared";
import { processInvoice } from "@/internal/invoices/InvoiceService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// processInvoice — processor_type wire mapping
//
// `processInvoice` is the single boundary between the raw Drizzle/cached
// `Invoice` row and the public V5 `ApiInvoiceV1` wire shape. It must always
// emit a defined `processor_type` regardless of input shape.
//
// Coverage matrix:
//   • explicit "stripe"     → wire "stripe"
//   • explicit "revenuecat" → wire "revenuecat"
//   • null                  → wire "stripe" (consumer `??` mask, since
//                              ZodDefault doesn't fire on explicit null)
//   • undefined             → wire "stripe" (same `??` mask covers it; the
//                              schema's ZodDefault would also fire through
//                              the cache walker before reaching this point)
//
// Together these tests prove the wire never emits null/undefined for the new
// optional field, regardless of where the input row came from (DB, cache,
// pre-deploy cached entry).
// ═══════════════════════════════════════════════════════════════════════════════

const buildBaseInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
	({
		id: "inv_test",
		created_at: 1_700_000_000_000,
		product_ids: [],
		internal_product_ids: [],
		internal_customer_id: "cus_int_test",
		internal_entity_id: null,
		stripe_id: "in_test",
		status: "paid",
		hosted_invoice_url: null,
		total: 100,
		amount_paid: 100,
		refunded_amount: 0,
		currency: "usd",
		discounts: [],
		items: [],
		processor_type: ProcessorType.Stripe,
		...overrides,
	}) as Invoice;

describe("processInvoice — processor_type wire mapping", () => {
	test("explicit stripe → wire stripe", () => {
		const wire = processInvoice({
			invoice: buildBaseInvoice({ processor_type: ProcessorType.Stripe }),
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
		expect(wire.stripe_id).toBe("in_test");
	});

	test("explicit revenuecat → wire revenuecat", () => {
		const wire = processInvoice({
			invoice: buildBaseInvoice({
				processor_type: ProcessorType.RevenueCat,
				stripe_id: "rc:txn_test",
			}),
		});
		expect(wire.processor_type).toBe(ProcessorType.RevenueCat);
		expect(wire.stripe_id).toBe("rc:txn_test");
	});

	test("null processor_type masks to stripe via consumer `??`", () => {
		// Simulates a cached payload from a DB row with NULL processor_type
		// that survived the cjson roundtrip without being stripped.
		const wire = processInvoice({
			invoice: buildBaseInvoice({
				processor_type: null as unknown as ProcessorType,
			}),
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
	});

	test("undefined processor_type masks to stripe via consumer `??`", () => {
		// Simulates a raw row from the cache walker that had the field
		// stripped by Upstash cjson (the most common pre-deploy case).
		const raw = buildBaseInvoice();
		delete (raw as Record<string, unknown>).processor_type;
		const wire = processInvoice({ invoice: raw });
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
	});
});
