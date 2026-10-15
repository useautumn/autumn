import { type AppEnv, LATEST_VERSION, type Role } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { DashboardSession } from "./dashboardSession.js";

/** An org member created by `s.member({ role })`, with a live dashboard session. */
export type ScenarioMember = DashboardSession & {
	role: Role;
	env: AppEnv;
};

/** An API client whose requests run as `member` (their role's scopes), not the org secret key. */
export const autumnAs = (member: ScenarioMember): AutumnInt => {
	const client = new AutumnInt({
		version: LATEST_VERSION,
		headers: {
			...Object.fromEntries(member.headers),
			"x-client-type": "dashboard",
			app_env: member.env,
		},
	});
	// The constructor falls back to the org secret key; drop it so only the session authenticates.
	delete client.headers.Authorization;
	return client;
};
