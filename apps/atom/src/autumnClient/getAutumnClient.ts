import type { AtomEnv } from "@autumn/env/atom";
import { createAutumnClient } from "./createAutumnClient.js";
import type { AutumnClient } from "./types/autumnClient.js";

let autumnClient: AutumnClient | undefined;

/** One per thread: module state is the thread's own. */
export const getAutumnClient = ({ env }: { env: AtomEnv }): AutumnClient => {
	autumnClient ??= createAutumnClient({
		autumnApiUrl: env.ATOM_AUTUMN_API_URL,
	});
	return autumnClient;
};
