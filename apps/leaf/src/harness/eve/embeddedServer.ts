import { $ } from "bun";

const EVE_PORT = process.env.EVE_PORT ?? "3999";

/** Runs eve inside the leaf task: leaf reaches it over loopback, matching
 * EVE_SERVER_URL's default, so prod needs no extra service or domain. */
export const startEmbeddedEveServer = async () => {
	const leafRoot = new URL("../../../", import.meta.url).pathname;
	// Session journals go to the chat DB (namespaced schemas) so they survive
	// redeploys; unset both vars and sessions fall back to ephemeral local files.
	const workflowPostgresUrl =
		process.env.WORKFLOW_POSTGRES_URL ?? process.env.CHAT_DATABASE_URL;
	await $`bunx eve build`.cwd(leafRoot);
	if (workflowPostgresUrl) {
		await $`bunx workflow-postgres-setup`
			.cwd(leafRoot)
			.env({ ...process.env, WORKFLOW_POSTGRES_URL: workflowPostgresUrl });
	}
	const eve = Bun.spawn({
		cmd: ["bun", ".output/server/index.mjs"],
		cwd: leafRoot,
		env: {
			...process.env,
			...(workflowPostgresUrl
				? { WORKFLOW_POSTGRES_URL: workflowPostgresUrl }
				: {}),
			// Eve's MCP connection dials leaf back via CHAT_PORT, which must be
			// leaf's own listen port — not the PORT override eve binds below.
			CHAT_PORT: process.env.CHAT_PORT ?? process.env.PORT ?? "3099",
			NITRO_HOST: process.env.EVE_HOST ?? "127.0.0.1",
			NITRO_PORT: EVE_PORT,
			PORT: EVE_PORT,
		},
		stderr: "inherit",
		stdout: "inherit",
	});
	// Fail fast so the orchestrator restarts the task with both servers in sync.
	eve.exited.then((code) => {
		console.error(`Embedded eve server exited (code ${code})`);
		process.exit(code === 0 ? 0 : 1);
	});
};
