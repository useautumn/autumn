import { describe, expect, test } from "bun:test";
import type { CreateInvoiceParams } from "@autumn/shared";
import { resolveInvoiceEnvelope } from "@/internal/invoices/actions/create/setup/resolveInvoiceEnvelope";

const JAN_1 = Date.UTC(2026, 0, 1);
const FEB_1 = Date.UTC(2026, 1, 1);

const params = (extra: Partial<CreateInvoiceParams>) =>
	({ customer_id: "cus", ...extra }) as CreateInvoiceParams;

describe("resolveInvoiceEnvelope", () => {
	test("is undefined without a top-level period, whatever the lines say", () => {
		expect(
			resolveInvoiceEnvelope({
				params: params({
					custom_line_items: [
						{
							description: "x",
							amount: 1,
							period_start: JAN_1,
							period_end: FEB_1,
						},
					],
				}),
			}),
		).toBeUndefined();
	});

	test("a line period beyond the largest valid date is a 400, not a crash", () => {
		let thrown: unknown;
		try {
			resolveInvoiceEnvelope({
				params: params({
					period_start: JAN_1,
					period_end: FEB_1,
					custom_line_items: [
						{
							description: "x",
							amount: 1,
							period_start: 8_640_000_000_000_001,
							period_end: 8_640_000_000_000_002,
						},
					],
				}),
			});
		} catch (error) {
			thrown = error;
		}
		expect((thrown as { statusCode?: number }).statusCode).toBe(400);
	});
});
