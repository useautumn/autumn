import { autoTopupLimitStates } from "@autumn/shared";
import { and, eq } from "drizzle-orm";

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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
