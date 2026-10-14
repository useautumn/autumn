import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";

const isPaidAllocatedRefusal = (error: unknown): boolean =>
	error instanceof BalanceWorkerClientError &&
	error.workerCode === "UNSUPPORTED_COMMAND" &&
	error.workerReason === "paid_allocated_not_supported";

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
		runLazyResets: false,
	});
	if (fullSubject) return fullSubject;
	if (entityId) throw new EntityNotFoundError({ entityId });
	throw new CustomerNotFoundError({ customerId });
};

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
