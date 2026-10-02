import type { AppEnv } from "@autumn/shared";
import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiomTabular } from "@/external/axiom/queryAxiom.js";
import {
	axiomNumberFrom,
	axiomStringFrom,
} from "@/external/axiom/utils/resultUtils.js";
import { buildShadowAtomResultsApl } from "./buildShadowAtomResultsApl.js";

export const SHADOW_ATOM_RESULT_RANGES = ["1h", "24h"] as const;
export type ShadowAtomResultRange = (typeof SHADOW_ATOM_RESULT_RANGES)[number];

export type ShadowAtomOrgResult = {
	org_id: string;
	checks: number;
	matches: number;
	mismatches: number;
	timeouts: number;
	errors: number;
	/** Of the checks both answered; null when the Atom answered none. */
	match_rate: number | null;
	p50_ms: number;
	p99_ms: number;
};

const rowToOrgResult = (row: Record<string, unknown>): ShadowAtomOrgResult => {
	const matches = axiomNumberFrom(row.matches);
	const mismatches = axiomNumberFrom(row.mismatches);
	const compared = matches + mismatches;
	return {
		org_id: axiomStringFrom(row.org_id),
		checks: axiomNumberFrom(row.checks),
		matches,
		mismatches,
		timeouts: axiomNumberFrom(row.timeouts),
		errors: axiomNumberFrom(row.errors),
		match_rate: compared > 0 ? matches / compared : null,
		p50_ms: axiomNumberFrom(row.p50_ms),
		p99_ms: axiomNumberFrom(row.p99_ms),
	};
};

export const queryShadowAtomResults = async ({
	env,
	range,
}: {
	env: AppEnv;
	range: ShadowAtomResultRange;
}) => {
	if (!isAxiomConfigured()) return { available: false, range, orgs: [] };
	const rows = await queryAxiomTabular({
		apl: buildShadowAtomResultsApl({ env }),
		options: { startTime: `now-${range}`, endTime: "now" },
	});
	return { available: true, range, orgs: rows.map(rowToOrgResult) };
};
