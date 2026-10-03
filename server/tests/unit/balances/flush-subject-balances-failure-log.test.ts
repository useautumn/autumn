import { expect, mock, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";

test("a failed balance flush reports unknown persistence without claiming data loss", async () => {
	const execute = mock(async () => {
		throw new Error("deadlock detected");
	});
	const logger = {
		error: mock(),
		warn: mock(),
		info: mock(),
		debug: mock(),
		child: mock(),
	};
	const db: Pick<AutumnContext["db"], "execute"> = { execute };
	const ctx: Partial<AutumnContext> = {
		db: db as AutumnContext["db"],
		logger,
	};

	await flushSubjectBalancesToDb({
		ctx: ctx as AutumnContext,
		customerId: "customer_123",
		subjectBalances: [],
		usageWindowUpdates: [
			{
				internal_customer_id: "internal_customer_123",
				feature_id: "messages",
				usage_windows: [],
			},
		],
		source: "invalidateSharedBalanceFields",
	});

	expect(execute).toHaveBeenCalledTimes(1);
	expect(logger.error).toHaveBeenCalledTimes(1);
	expect(logger.error).toHaveBeenCalledWith(
		"[flushSubjectBalancesToDb] customer_123: flush failed, persistence outcome unknown, source: invalidateSharedBalanceFields, error: Error: deadlock detected",
		{ error_type: "subject_balance_flush_failed" },
	);
	expect(logger.warn).not.toHaveBeenCalled();
	expect(logger.info).not.toHaveBeenCalled();
});
