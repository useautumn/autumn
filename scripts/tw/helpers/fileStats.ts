import {
	FILE_STATS_MARKER,
	type FileStats,
} from "../worker/runTestFileWithStats.ts";
import { readInlineBunScript } from "./inlineBunScript.ts";

export type { FileStats } from "../worker/runTestFileWithStats.ts";

const WRAPPER_SCRIPT = "scripts/tw/worker/runTestFileWithStats.ts";
let wrapperSource: string | undefined;

export const fileStatsWrapperSource = () => {
	wrapperSource ??= readInlineBunScript(WRAPPER_SCRIPT);
	return wrapperSource;
};

export const createFileStatsReader = ({
	onStats,
}: {
	onStats: (stats: FileStats) => void;
}) => {
	let pending = "";
	const readLine = (line: string) => {
		const start = line.indexOf(FILE_STATS_MARKER);
		if (start === -1) return;
		try {
			const stats = JSON.parse(
				line.slice(start + FILE_STATS_MARKER.length),
			) as FileStats;
			if (stats?.v === 1) onStats(stats);
		} catch {}
	};
	return {
		push: (chunk: string) => {
			pending += chunk;
			const lines = pending.split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines) readLine(line);
		},
		flush: () => {
			readLine(pending);
			pending = "";
		},
	};
};
