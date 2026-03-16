import { autoTopupLimitStates } from "@autumn/shared";
import { and, eq } from "drizzle-orm";

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const findAutoTopupLimitByScope = async ({
	ctx,
	internalCustomerId,
	featureId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	featureId: string;
}) => {
	const { org, env, db } = ctx;

	return await db.query.autoTopupLimits.findFirst({
		where: and(
			eq(autoTopupLimitStates.org_id, org.id),
			eq(autoTopupLimitStates.env, env),
			eq(autoTopupLimitStates.internal_customer_id, internalCustomerId),
			eq(autoTopupLimitStates.feature_id, featureId),
		),
	});
};
