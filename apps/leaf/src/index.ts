import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();
// Local dev runs eve separately (scripts/dev.ts spawns `eve dev`); prod embeds it.
const embedEve =
	process.env.EVE_EMBEDDED ??
	(process.env.NODE_ENV === "production" ? "1" : "0");
if (embedEve === "1") {
	const { startEmbeddedEveServer } = await import(
		"./harness/eve/embeddedServer.js"
	);
	await startEmbeddedEveServer();
}
await import("./main.js");
