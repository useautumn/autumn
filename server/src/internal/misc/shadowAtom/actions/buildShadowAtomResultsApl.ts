import type { AppEnv } from "@autumn/shared";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";

/** Per org: how the shadow Atom's answers compared with the API's, and how fast they came. */
export const buildShadowAtomResultsApl = ({ env }: { env: AppEnv }) =>
	[
		"['express']",
		`| where type == 'atom_shadow_check' and env == '${escapeApl(env)}'`,
		// Axiom rejects a field it has never ingested, so the query holds before the first line lands.
		"| extend latency_ms = toreal(column_ifexists('latency_ms', real(null)))",
		"| summarize checks = count(), matches = countif(status == 'match'), mismatches = countif(status == 'mismatch'), timeouts = countif(status == 'timeout'), errors = countif(status == 'atom_error'), p50_ms = percentile(latency_ms, 50), p99_ms = percentile(latency_ms, 99) by org_id",
		"| order by checks desc",
		"| limit 200",
	].join("\n");
