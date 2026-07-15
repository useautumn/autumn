/** TDD: pending payments must retain continuation metadata for the eventual Stripe webhook. */

import { expect, mock, test } from "bun:test";
import { AppEnv, type Metadata, MetadataType } from "@autumn/shared";

const state = {
	deletedMetadataIds: [] as string[],
	metadataUpdates: [] as { id: string; expiresAt: number }[],
	errorLogs: [] as string[],
	invoiceStatus: "open" as "open" | "paid",
	pendingPayment: true,
};

mock.module("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async () => ({
				status: state.invoiceStatus,
				subscription: null,
			}),
			voidInvoice: async () => {
				if (state.pendingPayment) {
					throw new Error(
						"Invoices with pending payments waiting to clear cannot be paid, voided, or marked uncollectible.",
					);
				}
			},
		},
	}),
}));

mock.module("@/internal/metadata/MetadataService.js", () => ({
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
