// BENCH ONLY (#369 write amplification, never merge): what each writer thread commits per second, by file class.
import { basename } from "node:path";
import { getAtomLogger } from "../../lib/logging/getAtomLogger.js";
import type { SqliteFileKind } from "./sqliteWrites.js";

type FileTotals = { commits: number; items: number; rowChanges: number };

const itemsOf = ({ op, payload }: { op: string; payload: string }): number => {
	const fields = payload.split("\u0000");
	if (op === "insertJournalEntries")
		return fields.filter((field) => field.startsWith("{")).length;
	if (op === "upsertSubjects") return Math.round((fields.length - 1) / 9);
	return 0;
};

export const createWriteAmpLog = () => {
	const kinds = new Map<number, { path: string; kind: SqliteFileKind }>();
	let totals = new Map<number, FileTotals>();

	function opened({
		fileId,
		path,
		kind,
	}: {
		fileId: number;
		path: string;
		kind: SqliteFileKind;
	}) {
		kinds.set(fileId, { path, kind });
	}

	function committed({
		fileId,
		op,
		payload,
		rowChanges,
	}: {
		fileId: number;
		op: string;
		payload: string;
		rowChanges: number;
	}) {
		const held = totals.get(fileId) ?? { commits: 0, items: 0, rowChanges: 0 };
		held.commits++;
		held.items += itemsOf({ op, payload });
		held.rowChanges += rowChanges;
		totals.set(fileId, held);
	}

	function flush(): void {
		const byKind = new Map<
			SqliteFileKind,
			FileTotals & {
				files: number;
				top: string;
				topCommits: number;
				topItems: number;
			}
		>();
		for (const [fileId, file] of totals) {
			const meta = kinds.get(fileId);
			if (!meta) continue;
			const sum = byKind.get(meta.kind) ?? {
				commits: 0,
				items: 0,
				rowChanges: 0,
				files: 0,
				top: "",
				topCommits: 0,
				topItems: 0,
			};
			sum.commits += file.commits;
			sum.items += file.items;
			sum.rowChanges += file.rowChanges;
			sum.files++;
			if (file.items > sum.topItems) {
				sum.top = basename(meta.path);
				sum.topCommits = file.commits;
				sum.topItems = file.items;
			}
			byKind.set(meta.kind, sum);
		}
		for (const [kind, sum] of byKind)
			getAtomLogger().info(
				{
					type: "atom_write_amp",
					data: {
						kind,
						...sum,
						itemsPerCommit: sum.commits
							? Number((sum.items / sum.commits).toFixed(2))
							: 0,
					},
				},
				"write amp",
			);
		totals = new Map();
	}

	setInterval(flush, 1000).unref?.();
	return { opened, committed };
};
