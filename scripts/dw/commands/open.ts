import { localServiceUrls } from "../helpers/publicUrls.ts";
import { resolveCurrentEntryOrFatal } from "../helpers/registry.ts";
import { log } from "../helpers/shell.ts";

export function browserOpenArgs({
	url,
	platform = process.platform,
}: {
	url: string;
	platform?: NodeJS.Platform;
}): string[] {
	if (platform === "darwin") return ["open", url];
	if (platform === "win32") return ["cmd", "/c", "start", "", url];
	return ["xdg-open", url];
}

export function cmdOpen(): void {
	const entry = resolveCurrentEntryOrFatal("bun dw open");
	const url = localServiceUrls({ entry }).vite;
	log(`opening ${url}`);
	Bun.spawn(browserOpenArgs({ url }), {
		stdin: "ignore",
		stdout: "ignore",
		stderr: "ignore",
	});
}
