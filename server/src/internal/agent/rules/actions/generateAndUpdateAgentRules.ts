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
	const [generated, existing] = await Promise.all([
		generateAgentRules({ ctx, endTime, startTime }),
		agentRulesRepo.get({ db: ctx.db, orgId: ctx.org.id }),
	]);
	// Generation only derives entity/credit rules; never overwrite user-written notes.
	const rules = await agentRulesRepo.upsert({
		db: ctx.db,
		metadata: generated.metadata,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
		rules: { ...generated.rules, notes: existing.notes },
	});

	return {
		...rules,
		unconfigured: generated.unconfigured ?? false,
	};
};
