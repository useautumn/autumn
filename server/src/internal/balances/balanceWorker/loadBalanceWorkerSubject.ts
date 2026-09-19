import { CustomerNotFoundError, type FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";

/** The worker decides on rows; the API balance still derives from the server's own FullSubject. */
export async function loadBalanceWorkerSubject({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string | null;
}): Promise<FullSubject> {
	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId: entityId ?? undefined,
		routeSource: "balance_worker",
	});
	// A missing customer is not an unsupported request: the legacy path answers
	// 404 customer_not_found, and callers branch on that code.
	if (!fullSubject) throw new CustomerNotFoundError({ customerId });
	return fullSubject;
}
