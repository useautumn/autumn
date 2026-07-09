import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();
// Bind leaf's port before eve's ~30s build/boot, or ALB health checks
// (5s interval, 2-fail threshold, no grace period) kill the task first.
await import("./main.js");
// Local dev runs eve separately (scripts/dev.ts spawns `eve dev`); prod embeds it.
const embedEve =
	process.env.EVE_EMBEDDED ??
	(process.env.NODE_ENV === "production" ? "1" : "0");
if (embedEve === "1") {
	const { startEmbeddedEveServer } = await import(
		"./harness/eve/embeddedServer.js"
	);
	startEmbeddedEveServer().catch((error) => {
		console.error("Embedded eve server failed to start", error);
		process.exit(1);
	});
}
