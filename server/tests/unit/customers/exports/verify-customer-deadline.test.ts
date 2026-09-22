/**
 * One customer whose database read never settles must not stall the whole
 * billing verify export, and gets a second attempt on a fresh connection
 * before it is failed.
 *
 * Red (current):  verifyCustomerToExportRows awaits CusService.getFull with no
 *                 bound, so a silent connection hangs the page, the stream and
 *                 the run forever.
 * Green (after):  the read is bounded and retried once; the customer is then
 *                 written as a verify_failed row naming the last error.
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { verifyCustomerToExportRows } from "@/internal/customers/exports/verify/verifyCustomerToExportRows.js";

const ctx = { logger: { warn: () => {} } } as unknown as AutumnContext;

const scalar = {
	internal_id: "cus_internal_1",
	id: "cus_1",
	name: "Jane",
	email: "jane@example.com",
	processor: { id: "cus_stripe_1" },
};

const sweep = {
	stripeReader: {} as Stripe,
	sweptSubscriptions: new Map<string, Stripe.Subscription[]>(),
};

const neverSettles = () => new Promise<never>(() => {});

describe("verifyCustomerToExportRows deadline", () => {
	afterEach(() => {
		spyOn(CusService, "getFull").mockRestore();
	});

	it("retries a read that never settles and fails the customer if it hangs again", async () => {
		const getFull = spyOn(CusService, "getFull").mockImplementation(
			neverSettles,
		);

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep,
			limits: { timeoutMs: 50, retryDelayMs: 0, attempts: 2 },
		});

		expect(getFull).toHaveBeenCalledTimes(2);
		expect(rows).toMatchObject([
			{ customer_id: "cus_1", severity: "error", issues: "verify_failed" },
		]);
		expect(rows[0].details).toContain("timed out");
	});

	it("reports the retry's own error when the hang was transient", async () => {
		spyOn(CusService, "getFull")
			.mockImplementationOnce(neverSettles)
			.mockRejectedValueOnce(new Error("boom"));

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep,
			limits: { timeoutMs: 50, retryDelayMs: 0, attempts: 2 },
		});

		expect(rows[0].details).toBe("boom");
	});

	it("rides out a dead pooled connection that also fails the first retry", async () => {
		const connectionError = new Error("Connection terminated unexpectedly");
		const getFull = spyOn(CusService, "getFull").mockRejectedValue(
			connectionError,
		);

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep,
			limits: { timeoutMs: 50, retryDelayMs: 0, maxRetryDelayMs: 0 },
		});

		expect(getFull).toHaveBeenCalledTimes(4);
		expect(rows[0].details).toBe("Connection terminated unexpectedly");
	});

	it("retries a transient database error, not only a stall", async () => {
		const getFull = spyOn(CusService, "getFull")
			.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
			.mockImplementationOnce(neverSettles);

		const rows = await verifyCustomerToExportRows({
			ctx,
			scalar,
			sweep,
			limits: { timeoutMs: 50, retryDelayMs: 0, attempts: 2 },
		});

		expect(getFull).toHaveBeenCalledTimes(2);
		expect(rows[0].details).toContain("timed out");
	});
});
