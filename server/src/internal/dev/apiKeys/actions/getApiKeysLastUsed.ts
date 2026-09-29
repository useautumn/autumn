import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiomTabular } from "@/external/axiom/queryAxiom.js";
import { buildApiKeysLastUsedQuery } from "@/external/axiom/utils/aplUtils.js";
import { axiomStringFrom } from "@/external/axiom/utils/resultUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

// Axiom returns _time aggregates as RFC3339 strings or nanosecond epochs.
const toEpochMs = (value: unknown) =>
	typeof value === "number"
		? Math.floor(value / 1e6)
		: Date.parse(axiomStringFrom(value));

export const getApiKeysLastUsed = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<Record<string, number>> => {
	if (!isAxiomConfigured()) return {};

	const rows = await queryAxiomTabular({
		apl: buildApiKeysLastUsedQuery({ orgId: ctx.org.id, env: ctx.env }),
		options: { startTime: "now-7d", endTime: "now" },
	});

	const lastUsed: Record<string, number> = {};
	for (const row of rows) {
		const apiKeyId = axiomStringFrom(row.api_key_id);
		const lastUsedAt = toEpochMs(row.last_used);
		if (apiKeyId && !Number.isNaN(lastUsedAt)) lastUsed[apiKeyId] = lastUsedAt;
	}
	return lastUsed;
};
