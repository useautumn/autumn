import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isHeadless } from "./headless.ts";

export type CloudPublicUrls = {
	api?: string;
	vite?: string;
};

/** Parse `~/.autumn-agent/public-urls.txt` from Cloud `ngrok.sh`. */
export function parseCloudPublicUrls(text: string): CloudPublicUrls {
	const out: CloudPublicUrls = {};
	for (const line of text.split(/\r?\n/)) {
		const https = line.match(/https:\/\/\S+/);
		if (!https) continue;
		const url = https[0].replace(/[.,;]+$/, "");
		if (/\bvite\b/i.test(line) || line.includes(":3000")) out.vite = url;
		else if (/\bapi\b/i.test(line) || line.includes(":8080")) out.api = url;
	}
	return out;
}

export function cloudPublicUrls(): CloudPublicUrls {
	if (!isHeadless()) return {};
	const file = join(homedir(), ".autumn-agent", "public-urls.txt");
	if (!existsSync(file)) return {};
	return parseCloudPublicUrls(readFileSync(file, "utf8"));
}
