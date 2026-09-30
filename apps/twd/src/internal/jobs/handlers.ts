import { handleNukeJob } from "../accounts/nuke/handleNukeJob.ts";
import { handleFullNukeKeyJob } from "../keys/fullNuke/handleFullNukeKeyJob.ts";
import { handleReinitKeysJob } from "../keys/reinit/handleReinitKeysJob.ts";
import { handleSwarmJob } from "../runs/swarm/handleSwarmJob.ts";
import { handleWarmJob } from "../runs/warm/handleWarmJob.ts";
import type { JobHandlers } from "./types/jobHandler.ts";

export const JOB_HANDLERS: JobHandlers = {
	warm: handleWarmJob,
	swarm: handleSwarmJob,
	nuke: handleNukeJob,
	reinit_keys: handleReinitKeysJob,
	full_nuke_key: handleFullNukeKeyJob,
};
