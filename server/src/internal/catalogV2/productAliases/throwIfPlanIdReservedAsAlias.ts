import {
	type AppEnv,
	ErrCode,
	productAliases,
	RecaseError,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const throwIfPlanIdReservedAsAlias = async ({
	ctx,
	planId,
	orgId,
	env,
}: {
	ctx: AutumnContext;
	planId: string;
	orgId?: string;
	env?: AppEnv;
}): Promise<void> => {
	const targetOrgId = orgId ?? ctx.org.id;
	const targetEnv = env ?? ctx.env;

	const owner =
		targetOrgId === ctx.org.id && targetEnv === ctx.env
			? ctx.org.planAliases?.[planId]
			: (
					await ctx.db.query.productAliases.findFirst({
						where: and(
							eq(productAliases.org_id, targetOrgId),
							eq(productAliases.env, targetEnv),
							eq(productAliases.alias_id, planId),
						),
					})
				)?.canonical_plan_id;

	if (!owner) return;

	throw new RecaseError({
		message: `Plan ID '${planId}' is reserved as an alias of '${owner}'`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
