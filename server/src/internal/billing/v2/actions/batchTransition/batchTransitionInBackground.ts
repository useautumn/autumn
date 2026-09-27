import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject";
import { batchTransition } from "./batchTransition";
import type { BatchTransitionExecutionScope } from "./types/types";

/** A batch transition that outlives its request: the route's cache eviction already ran, so it evicts once its seats are written. */
export const batchTransitionInBackground = async ({
	ctx,
	transition,
	executionScope,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	executionScope: BatchTransitionExecutionScope;
}): Promise<void> => {
	await batchTransition({ ctx, transition, executionScope });

	const customer = await CusService.getByInternalId({
		db: ctx.db,
		internalId: transition.incomingCustomerLicense.internal_customer_id,
		errorIfNotFound: false,
	});
	if (!customer) return;
	await invalidateCachedFullSubject({
		ctx,
		customerId: customer.id || customer.internal_id,
		source: "batchTransitionInBackground",
	});
};
