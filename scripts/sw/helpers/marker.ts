import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARKER_FILE } from "../constants.ts";
import type { RemoteMarker } from "../types.ts";

const markerPath = (checkoutPath: string): string =>
	join(checkoutPath, MARKER_FILE);

/**
 * Write the remote marker into a worktree's LOCAL checkout. Flat KEY=value so the
 * POSIX wrapper shell can `.`-source it without a parser. Values are devbox hosts
 * and absolute paths (no spaces), so no quoting is needed.
 */
export function writeMarker(checkoutPath: string, marker: RemoteMarker): void {
	const body = [
		`target=${marker.target}`,
		`host=${marker.host}`,
		`path=${marker.path}`,
		`branch=${marker.branch}`,
		"",
	].join("\n");
	writeFileSync(markerPath(checkoutPath), body);
}

export function readMarker(checkoutPath: string): RemoteMarker | null {
	const path = markerPath(checkoutPath);
	if (!existsSync(path)) return null;
	const values: Record<string, string> = {};
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const match = line.match(/^([a-z_]+)=(.*)$/);
		if (match) values[match[1]] = match[2];
	}
	if (!(values.host && values.path && values.target)) return null;
	return {
		target: values.target as RemoteMarker["target"],
		host: values.host,
		path: values.path,
		branch: values.branch ?? "",
	};
}

export function removeMarker(checkoutPath: string): void {
	rmSync(markerPath(checkoutPath), { force: true });
}
