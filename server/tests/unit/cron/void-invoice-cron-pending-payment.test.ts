/** TDD: pending payments must retain continuation metadata for the eventual Stripe webhook. */

import { expect, test } from "bun:test";
import { AppEnv, type Metadata, MetadataType } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const LEGACY_PENDING_MESSAGE =
	"Invoices with pending payments waiting to clear cannot be paid, voided, or marked uncollectible.";
const CURRENT_PENDING_MESSAGE =
	"This invoice can't be modified while a payment on it is still pending. Wait for the payment to clear, then try again.";

const state = {
	deletedMetadataIds: [] as string[],
	metadataUpdates: [] as { id: string; expiresAt: number }[],
	errorLogs: [] as string[],
	invoiceStatus: "open" as "open" | "paid",
	pendingPayment: true,
	pendingMessage: LEGACY_PENDING_MESSAGE,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async () => ({
				status: state.invoiceStatus,
				subscription: null,
			}),
			voidInvoice: async () => {
				if (state.pendingPayment) {
					throw new Error(state.pendingMessage);
				}
			},
		},
	}),
}));

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		delete: async ({ id }: { id: string }) => {
			state.deletedMetadataIds.push(id);
		},
		update: async ({
			id,
			updates,
		}: {
			id: string;
			updates: { expires_at: number };
		}) => {
			state.metadataUpdates.push({ id, expiresAt: updates.expires_at });
		},
	},
}));

const { handleVoidInvoiceCron } = await import(
	"@/cron/invoiceCron/runInvoiceCron.js"
);
const { voidInvoiceAtDueDate } = await import(
	"@/internal/billing/v2/actions/expirePendingPlan/execute/voidInvoiceAtDueDate.js"
);

const metadata = {
	id: "meta_pending_payment",
	type: MetadataType.InvoiceActionRequired,
	stripe_invoice_id: "in_pending_payment",
	data: {
		org: { slug: "test-org" },
		customer: { id: "cus_pending_payment", env: AppEnv.Sandbox },
	},
} as unknown as Metadata;

const resetState = () => {
	state.deletedMetadataIds = [];
	state.metadataUpdates = [];
	state.errorLogs = [];
	state.invoiceStatus = "open";
	state.pendingPayment = true;
	state.pendingMessage = LEGACY_PENDING_MESSAGE;
};

const runCron = () =>
	handleVoidInvoiceCron({
		metadata,
		ctx: {
			db: {} as never,
			logger: {
				error: (message: string) => state.errorLogs.push(message),
				info: () => {},
				warn: () => {},
			} as never,
		},
	});

test("backs off cleanup when Stripe has a pending payment", async () => {
	resetState();
	const startedAt = Date.now();

	await runCron();

	expect(state.deletedMetadataIds).toEqual([]);
	expect(state.metadataUpdates).toHaveLength(1);
	expect(state.metadataUpdates[0]?.id).toBe(metadata.id);
	expect(state.metadataUpdates[0]?.expiresAt).toBeGreaterThan(
		startedAt + 23 * 60 * 60 * 1000,
	);
	expect(state.errorLogs).toHaveLength(0);
});

test("preserves metadata when the pending payment later succeeds", async () => {
	resetState();
	await runCron();

	state.invoiceStatus = "paid";
	await runCron();

	expect(state.deletedMetadataIds).toEqual([]);
});

test("cleans up after the pending payment later fails", async () => {
	resetState();
	await runCron();

	state.pendingPayment = false;
	await runCron();

	expect(state.deletedMetadataIds).toEqual([metadata.id]);
});

test("backs off cleanup on Stripe's current pending-payment message", async () => {
	resetState();
	state.pendingMessage = CURRENT_PENDING_MESSAGE;

	await runCron();

	expect(state.deletedMetadataIds).toEqual([]);
	expect(state.metadataUpdates).toHaveLength(1);
	expect(state.errorLogs).toHaveLength(0);
});

test.each([LEGACY_PENDING_MESSAGE, CURRENT_PENDING_MESSAGE])(
	"due-date void defers a day on pending payment: %s",
	async (message) => {
		resetState();

		const closed = await voidInvoiceAtDueDate({
			ctx: { db: {}, logger: { info: () => {} } } as never,
			stripeCli: {
				invoices: {
					voidInvoice: async () => {
						throw new Error(message);
					},
				},
			} as never,
			metadata,
			stripeInvoice: { id: "in_pending_payment", status: "open" } as never,
		});

		expect(closed).toBe(false);
		expect(state.metadataUpdates).toHaveLength(1);
	},
);

test("due-date void still rethrows unrelated Stripe errors", async () => {
	resetState();

	const result = voidInvoiceAtDueDate({
		ctx: { db: {}, logger: { info: () => {} } } as never,
		stripeCli: {
			invoices: {
				voidInvoice: async () => {
					throw new Error("No such invoice");
				},
			},
		} as never,
		metadata,
		stripeInvoice: { id: "in_pending_payment", status: "open" } as never,
	});

	await expect(result).rejects.toThrow("No such invoice");
	expect(state.metadataUpdates).toHaveLength(0);
});
