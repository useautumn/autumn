import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import type { IsCustomCorrection } from "./fullCustomerWithDerivedIsCustom.js";

/** Compare-and-set per row, so one written since it was read is left alone. */
export const persistIsCustomCorrections = async ({
	ctx,
	customerId,
	corrections,
}: {
	ctx: AutumnContext;
	customerId: string;
	corrections: IsCustomCorrection[];
}) => {
	let wrote = false;
	try {
		for (const { stored, to } of corrections) {
			const written = await customerProductRepo.setIsCustom({
				ctx,
				internalCustomerId: stored.internal_customer_id,
				customerProductId: stored.id,
				from: stored.is_custom,
				to,
				readUpdatedAt: stored.updated_at,
			});
			wrote ||= written;
		}
	} finally {
		if (wrote) {
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				source: "migration-is-custom",
			});
		}
	}
};
