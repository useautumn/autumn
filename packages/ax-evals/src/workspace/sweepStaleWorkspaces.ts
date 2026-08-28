import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { STALE_AFTER_MS, WORKSPACE_ROOT } from "./workspacePaths.ts";

/** Self-healing against crashed runs: removes workspaces older than a day. */
export const sweepStaleWorkspaces = async (): Promise<void> => {
	if (!existsSync(WORKSPACE_ROOT)) return;
	const now = Date.now();
	for (const entry of await readdir(WORKSPACE_ROOT)) {
		const path = join(WORKSPACE_ROOT, entry);
		try {
			const info = await stat(path);
			if (now - info.mtimeMs > STALE_AFTER_MS)
				await rm(path, { recursive: true, force: true });
		} catch {
			// already gone — another run swept it
		}
	}
};
