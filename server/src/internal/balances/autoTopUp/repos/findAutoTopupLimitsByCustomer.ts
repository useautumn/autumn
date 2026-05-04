import { autoTopupLimitStates } from "@autumn/shared";
import { and, eq } from "drizzle-orm";

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * Fetch all auto_topup_limit_states rows for a customer (across features).
 * Used by the read-side expand path to surface runtime purchase tracking.
 */
export const findAutoTopupLimitsByCustomer = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}) => {
	const { org, env, db } = ctx;

	return await db.query.autoTopupLimits.findMany({
		where: and(
			eq(autoTopupLimitStates.org_id, org.id),
			eq(autoTopupLimitStates.env, env),
			eq(autoTopupLimitStates.internal_customer_id, internalCustomerId),
		),
	});
};
