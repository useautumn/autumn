import type { CarryOverUsages } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { TransitionRulesService } from "@/internal/orgs/transitionRules/TransitionRulesService";

/** Explicit param wins; otherwise inherit the org's transition rule for this env. */
export const resolveCarryOverUsagesParam = async ({
	ctx,
	carryOverUsages,
}: {
	ctx: AutumnContext;
	carryOverUsages?: CarryOverUsages;
}): Promise<CarryOverUsages> => {
	if (carryOverUsages !== undefined) return carryOverUsages;

	const rule = await TransitionRulesService.get({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return rule?.carry_over_usages ?? undefined;
};
