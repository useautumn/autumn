import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

/**
 * @deprecated Thin wrapper over `invalidateCachedFullSubject` kept for legacy
 * callers (incl. the cloud superset repo). New code should call it directly.
 */
export const deleteCachedFullCustomer = async ({
	ctx,
	customerId,
	entityId,
	source,
	flushBalances = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	/** No-op since the legacy FullCustomer cache was removed. */
	skipGuard?: boolean;
	flushBalances?: boolean;
}): Promise<void> => {
	if (!customerId) return;

	await invalidateCachedFullSubject({
		ctx,
		customerId,
		entityId,
		source,
		flushBalances,
	});
};
