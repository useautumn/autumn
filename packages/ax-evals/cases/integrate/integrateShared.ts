import { evalBackendUrl } from "../../src/workspace/backendUrl.ts";

/** The environment facts every integration case shares, regardless of which
 * catalog the org was seeded with. */
export const integrateScenario = {
	primer: [
		"Project state (already verified, do not re-check): this is the app's repo;",
		"autumn-js is installed in node_modules; AUTUMN_SECRET_KEY is in .env and valid.",
		`IMPORTANT: this environment talks to a local Autumn server — construct the SDK client with serverURL: "${evalBackendUrl()}"`,
		"in addition to the secret key, or calls will fail.",
		"The billing catalog is already done: autumn.config.ts in this repo was pushed via atmn — read it to learn the plan and feature ids. Do not edit or re-push it.",
	].join(" "),
};

/** The notes-api fixture's signed-in user — every request runs as this
 * identity. */
export const fixtureUser = {
	id: "user_123",
	email: "ada@acme.dev",
};
