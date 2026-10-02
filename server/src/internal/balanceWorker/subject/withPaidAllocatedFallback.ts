import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";

/** The worker's one refusal Postgres still serves: a v1 paid allocated grant, which invoices on every deduction. */
const isPaidAllocatedRefusal = (error: unknown): boolean =>
	error instanceof BalanceWorkerClientError &&
	error.workerCode === "UNSUPPORTED_COMMAND" &&
	error.workerReason === "paid_allocated_not_supported";

/** The subject as Postgres holds it now, on the primary and past any cache. */
const readFreshSubject = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}): Promise<FullSubject> => {
	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId,
		readFrom: "primary",
	});
	if (fullSubject) return fullSubject;
	if (entityId) throw new EntityNotFoundError({ entityId });
	throw new CustomerNotFoundError({ customerId });
};

/**
 * Run on the worker; when it refuses a v1 paid allocated grant, run the Postgres step on fresh rows instead.
 * The worker flushes lazily, so it is evicted first to land its writes before the read, and evicted after so a
 * copy rehydrated mid-write is dropped. Any other error is the caller's.
 */
export const withPaidAllocatedFallback = async <Result>({
	ctx,
	customerId,
	entityId,
	worker,
	postgres,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	worker: () => Promise<Result>;
	postgres: (params: { fullSubject: FullSubject }) => Promise<Result>;
}): Promise<Result> => {
	try {
		return await worker();
	} catch (error) {
		if (!isPaidAllocatedRefusal(error)) throw error;
		ctx.logger.info(
			{ type: "balance_worker_paid_allocated_fallback" },
			"Balance worker refused a paid allocated grant; running it on Postgres",
		);
	}
	await evictBalanceWorkerCustomer({ ctx, customerId });
	const fullSubject = await readFreshSubject({ ctx, customerId, entityId });
	try {
		return await postgres({ fullSubject });
	} finally {
		await evictBalanceWorkerCustomer({ ctx, customerId });
	}
};
