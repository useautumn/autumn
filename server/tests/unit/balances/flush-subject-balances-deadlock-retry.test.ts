import { expect, mock, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";

const buildCtx = ({ execute }: { execute: () => Promise<unknown> }) => {
	const logger = {
		error: mock(),
		warn: mock(),
		info: mock(),
		debug: mock(),
		child: mock(),
	};
	const db: Pick<AutumnContext["db"], "execute"> = {
		execute: execute as AutumnContext["db"]["execute"],
	};
	return { ctx: { db, logger } as unknown as AutumnContext, logger };
};

const lockConflict = ({ code }: { code: string }) =>
	Object.assign(new Error("deadlock detected"), { code });

const flush = ({ ctx }: { ctx: AutumnContext }) =>
	flushSubjectBalancesToDb({
		ctx,
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

for (const code of ["40P01", "40001"]) {
	test(`a flush rolled back by ${code} is retried until it persists`, async () => {
		const execute = mock(async () => {
			if (execute.mock.calls.length === 1) throw lockConflict({ code });
			return { rows: [] };
		});
		const { ctx, logger } = buildCtx({ execute });

		await flush({ ctx });

		expect(execute).toHaveBeenCalledTimes(2);
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledTimes(1);
	});
}

test("a flush that keeps deadlocking gives up and reports unknown persistence", async () => {
	const execute = mock(async () => {
		throw lockConflict({ code: "40P01" });
	});
	const { ctx, logger } = buildCtx({ execute });

	await flush({ ctx });

	expect(execute).toHaveBeenCalledTimes(3);
	expect(logger.error).toHaveBeenCalledTimes(1);
});
