import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import {
	type CloudPublicUrls,
	parseCloudPublicUrls,
} from "./cloudPublicUrls.ts";
import { isHeadless } from "./headless.ts";
import { loadRegistry, saveRegistry } from "./registry.ts";
import { log, shInherit } from "./shell.ts";

const NGROK_UP = join(
	PROJECT_ROOT,
	"scripts/setup/cursor-cloud/ngrok-up.sh",
);

function urlsFromDisk(): CloudPublicUrls {
	const file = join(homedir(), ".autumn-agent", "public-urls.txt");
	if (!existsSync(file)) return {};
	return parseCloudPublicUrls(readFileSync(file, "utf8"));
}

/** Cloud / DW_HEADLESS: always start a public ngrok tunnel when the authtoken
 *  is available. Does not use Docker compose or reserved domains (those
 *  collide across concurrent Cloud VMs). Laptop `bun dw setup` is unchanged. */
export function ensureHeadlessNgrok(entry: RegistryEntry): RegistryEntry {
	if (!isHeadless()) return entry;
	if (!existsSync(NGROK_UP)) {
		log("ngrok-up.sh missing — skip public tunnel");
		return entry;
	}
	log("ensuring Cloud ngrok tunnel (random *.ngrok.app)");
	const code = shInherit("bash", [NGROK_UP]);
	if (code !== 0) {
		log(`ngrok-up.sh exited ${code} — continuing without a public URL`);
	}
	const urls = urlsFromDisk();
	const next: RegistryEntry = {
		...entry,
		...(urls.api && { ngrokUrl: urls.api }),
		...(urls.vite && { ngrokViteUrl: urls.vite }),
	};
	const registry = loadRegistry();
	registry[entry.path] = { ...(registry[entry.path] ?? next), ...next };
	saveRegistry(registry);
	if (next.ngrokUrl) log(`ngrok api  ${next.ngrokUrl}`);
	if (next.ngrokViteUrl) log(`ngrok vite ${next.ngrokViteUrl}`);
	return next;
}
