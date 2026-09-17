import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

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
	if (!fullSubject)
		throw new BalanceWorkerUnsupportedError({ reason: "customer_not_found" });
	return fullSubject;
}
