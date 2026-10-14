import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readSqliteWriterThreadStats,
	spawnSqliteWriterWith,
} from "../../../src/state/writer/getSqliteWriter.js";
import { openWrittenFile } from "../../../src/state/writer/openWrittenFile.js";

const WRITER_ENTRY = join(
	import.meta.dir,
	"../../../src/state/writer/sqliteWriterEntry.ts",
);

/** This thread's writer is started here, before its first file opens, so the test can end it as a crash would. */
export const holdSqliteWriter = (): { terminate(): void } => {
	let worker: Worker | null = null;
	spawnSqliteWriterWith({
		spawn: () => {
			worker = new Worker(WRITER_ENTRY);
			return worker;
		},
	});
	return { terminate: () => worker?.terminate() };
};

let barrierFolder: string | null = null;

/** An open and close wait for the writer, settling every write it answers before them: the port is FIFO. */
const syncWithWriter = () => {
	barrierFolder ??= mkdtempSync(join(tmpdir(), "atom-writer-barrier-"));
	openWrittenFile({
		databasePath: join(barrierFolder, "barrier.sqlite"),
		kind: "journal",
	}).close();
};

/** Runs what is queued, and every write it posts, until a pass through the writer answers no write. */
export const settleSqliteWrites = async (): Promise<void> => {
	for (;;) {
		await new Promise<void>((resolve) => setImmediate(resolve));
		const before = readSqliteWriterThreadStats().sqliteWriterRoundTrips;
		syncWithWriter();
		if (readSqliteWriterThreadStats().sqliteWriterRoundTrips === before) return;
	}
};
