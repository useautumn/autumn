import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

type MarkFailedArgs = { id: string; errorMessage: string };

const markFailedCalls: MarkFailedArgs[] = [];

const mockState: { markFailedIfActive: () => Promise<boolean> } = {
	markFailedIfActive: async () => true,
};

const actualService = await import(
	"@/internal/customers/exports/CustomerExportService.js"
);

// Bun module mocks are process-global; spread the real module so later test
// files importing the other service methods still load.
mock.module("@/internal/customers/exports/CustomerExportService.js", () => ({
	...actualService,
	CustomerExportService: {
		...actualService.CustomerExportService,
		markFailedIfActive: (args: MarkFailedArgs) => {
			markFailedCalls.push({ id: args.id, errorMessage: args.errorMessage });
			return mockState.markFailedIfActive();
		},
	},
}));

const { failCustomerExportRun } = await import(
	"@/internal/customers/exports/workflows/complete/failCustomerExportRun.js"
);

const errors: string[] = [];
const stubLogger = {
	warn: () => {},
	error: (message: string) => errors.push(message),
	info: () => {},
	debug: () => {},
} as unknown as Logger;

const db = {} as DrizzleCli;
const payload = { exportId: "cusexp_123", orgId: "org_1", env: "sandbox" };

describe("failCustomerExportRun", () => {
	beforeEach(() => {
		markFailedCalls.length = 0;
		errors.length = 0;
		mockState.markFailedIfActive = async () => true;
	});

	it("fails the export a crashed run left behind", async () => {
		await failCustomerExportRun({
			db,
			logger: stubLogger,
			rawPayload: payload,
			error: new Error("failed to build context"),
		});

		expect(markFailedCalls).toHaveLength(1);
		expect(markFailedCalls[0].id).toBe("cusexp_123");
		expect(markFailedCalls[0].errorMessage).not.toContain("build context");
	});

	it("keeps the raw cause out of the row but in the logs", async () => {
		await failCustomerExportRun({
			db,
			logger: stubLogger,
			rawPayload: payload,
			error: new Error("createTriggerContext: org=90LN env=sandbox"),
		});

		expect(markFailedCalls[0].errorMessage).not.toContain("90LN");
		expect(errors).toContain("customer-export: run failed");
	});

	it("leaves a row that already reached a terminal state alone", async () => {
		mockState.markFailedIfActive = async () => false;

		await failCustomerExportRun({
			db,
			logger: stubLogger,
			rawPayload: payload,
			error: new Error("boom"),
		});

		expect(markFailedCalls).toHaveLength(1);
		expect(errors).toContain("customer-export: run failed");
	});

	it("cannot fail a row it cannot identify", async () => {
		await failCustomerExportRun({
			db,
			logger: stubLogger,
			rawPayload: { orgId: "org_1" },
			error: new Error("boom"),
		});

		expect(markFailedCalls).toHaveLength(0);
		expect(errors).toContain(
			"customer-export: run failed with an unreadable payload",
		);
	});

	it("does not rethrow when the status write keeps failing", async () => {
		mockState.markFailedIfActive = async () => {
			throw new Error("connection timeout");
		};

		await failCustomerExportRun({
			db,
			logger: stubLogger,
			rawPayload: payload,
			error: new Error("boom"),
		});

		expect(markFailedCalls).toHaveLength(3);
		expect(errors).toContain(
			"customer-export: could not record the failed run",
		);
	}, 10_000);
});
