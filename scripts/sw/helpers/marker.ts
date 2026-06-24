import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARKER_FILE } from "../constants.ts";
import type { RemoteMarker } from "../types.ts";

const markerPath = (checkout: string): string => join(checkout, MARKER_FILE);

/**
 * Write the remote marker into a worktree's LOCAL checkout. Flat KEY=value so the
 * POSIX wrapper shell can `.`-source it. Persists on disk → restored panes (after
 * a herdr restart) re-ssh automatically.
 */
export function writeMarker(checkout: string, marker: RemoteMarker): void {
	writeFileSync(
		markerPath(checkout),
		`host=${marker.host}\npath=${marker.path}\n`,
	);
}

export function removeMarker(checkout: string): void {
	rmSync(markerPath(checkout), { force: true });
}
