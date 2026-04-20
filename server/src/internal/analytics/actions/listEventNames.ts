import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

/** Lists distinct event names for the org sorted by popularity */
export const listEventNames = async ({
	ctx,
	limit,
}: {
	ctx: AutumnContext;
	limit?: number;
}): Promise<EventNameWithCount[]> => {
	const { org, env } = ctx;
	const pipes = getTinybirdPipes();

	const result = await pipes.listEventNames({
		org_id: org.id,
		env,
		limit,
	});


	return result.data;
};
