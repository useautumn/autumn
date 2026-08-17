import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import { log, shInherit } from "./shell.ts";

const AGENT_SERVICES = join(PROJECT_ROOT, "scripts/setup/agent-services.sh");

/** Local Postgres/Redis/ClickHouse/ElasticMQ — Cloud / Devin, not Neon+compose. */
export function ensureLocalInfra(): void {
	log("ensuring local agent services");
	const code = shInherit("bash", [AGENT_SERVICES], { cwd: PROJECT_ROOT });
	if (code !== 0) {
		log(`agent-services.sh exited ${code}`);
	}
}
