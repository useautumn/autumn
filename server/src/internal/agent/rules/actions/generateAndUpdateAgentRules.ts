import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateAgentRules } from "../../workflows/generateAgentRules/generateAgentRules.js";
import { agentRulesRepo } from "../repos/index.js";

export const generateAndUpdateAgentRules = async ({
	ctx,
	endTime,
	startTime,
}: {
	ctx: AutumnContext;
	endTime?: string;
	startTime?: string;
}) => {
	const generated = await generateAgentRules({ ctx, endTime, startTime });
	const rules = await agentRulesRepo.upsert({
		db: ctx.db,
		metadata: generated.metadata,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
		rules: generated.rules,
	});

	return {
		...rules,
		unconfigured: generated.unconfigured ?? false,
	};
};
