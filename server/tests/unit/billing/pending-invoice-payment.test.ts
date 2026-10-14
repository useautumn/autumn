import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv, type Metadata, MetadataType } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	errorMessage: "",
};
const voidInvoice = mock(async () => {
	throw new Error(state.errorMessage);
});
const metadataUpdate = mock(
	async (_params: {
		db: CronContext["db"];
		id: string;
		updates: { expires_at: number };
	}) => undefined,
);
const metadataDelete = mock(async () => undefined);
const expireCustomerProducts = mock(async () => undefined);
const releasePendingPlan = mock(async () => undefined);
const logger = {
	error: mock(),
	warn: mock(),
	info: mock(),
	debug: mock(),
	child: mock(),
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async () => ({
				id: "in_123",
				status: "open",
				amount_paid: 0,
			}),
			voidInvoice,
		},
	}),
}));
await mockModuleWithRestore("@/external/redis/resolveRedisV2.js", () => ({
	resolveRedisV2: () => ({}),
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/execute/withDeferredBillingPlanLock.js",
	() => ({
		withDeferredBillingPlanLock: ({ fn }: { fn: () => Promise<unknown> }) =>
			fn(),
	}),
);
await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		get: async () => ({ id: "meta_123" }),
		update: metadataUpdate,
		delete: metadataDelete,
	},
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts.js",
	() => ({ expirePendingCustomerProducts: expireCustomerProducts }),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/actions/expirePendingPlan/execute/releaseExpiredPendingPlan.js",
	() => ({ releaseExpiredPendingPlan: releasePendingPlan }),
);

const { handleVoidInvoiceCron } = await import(
	"@/cron/invoiceCron/runInvoiceCron.js"
);

beforeEach(() => {
	for (const spy of [
		voidInvoice,
		metadataUpdate,
		metadataDelete,
		expireCustomerProducts,
		releasePendingPlan,
		logger.error,
		logger.warn,
		logger.info,
	]) {
		spy.mockClear();
	}
});

const runCron = ({ metadataType }: { metadataType: MetadataType }) =>
	handleVoidInvoiceCron({
		ctx: { db: {} as CronContext["db"], logger },
		metadata: {
			id: "meta_123",
			type: metadataType,
			stripe_invoice_id: "in_123",
			data: {
				org: { id: "org_123", slug: "test-org" },
				customer: { id: "customer_123", env: AppEnv.Sandbox },
			},
		} as unknown as Metadata,
	});

for (const metadataType of [
	MetadataType.DeferredInvoice,
	MetadataType.InvoiceActionRequired,
]) {
	test.each([
		"Invoices with pending payments waiting to clear cannot be paid, voided, or marked uncollectible.",
		"This invoice can't be modified while a payment on it is still pending. Wait for the payment to clear, then try again.",
	])(
		`${metadataType} defers cleanup for a pending payment: %s`,
		async (message) => {
			state.errorMessage = message;
			const startedAt = Date.now();

			await runCron({ metadataType });

			const retryAt = expect.any(Number);
			expect(voidInvoice).toHaveBeenCalledTimes(1);
			expect(voidInvoice).toHaveBeenCalledWith("in_123");
			expect(metadataUpdate).toHaveBeenCalledTimes(1);
			expect(metadataUpdate).toHaveBeenCalledWith({
				db: {},
				id: "meta_123",
				updates: { expires_at: retryAt },
			});
			expect(
				metadataUpdate.mock.calls[0]?.[0]?.updates.expires_at,
			).toBeGreaterThanOrEqual(startedAt + 24 * 60 * 60 * 1000);
			expect(
				metadataUpdate.mock.calls[0]?.[0]?.updates.expires_at,
			).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
			expect(metadataDelete).not.toHaveBeenCalled();
			expect(expireCustomerProducts).not.toHaveBeenCalled();
			expect(releasePendingPlan).not.toHaveBeenCalled();
			expect(logger.error).not.toHaveBeenCalled();
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("pending payment"),
			);
		},
	);

	test(`${metadataType} still reports unrelated invoice errors`, async () => {
		state.errorMessage = "invoice operation failed";

		await runCron({ metadataType });

		expect(metadataUpdate).not.toHaveBeenCalled();
		expect(metadataDelete).not.toHaveBeenCalled();
		expect(expireCustomerProducts).not.toHaveBeenCalled();
		expect(releasePendingPlan).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error.mock.calls[0]?.[0]).toContain(state.errorMessage);
	});
}
