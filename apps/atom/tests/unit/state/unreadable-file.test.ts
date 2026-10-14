import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSlotDatabase } from "../../../src/state/openSlotDatabase.js";
import { removeUnreadableFiles } from "../../../src/state/removeUnreadableFiles.js";

const root = mkdtempSync(join(tmpdir(), "atom-unreadable-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ROW =
	"INSERT INTO subject_states (customer_id, entity_id, log_offset, read_at, applied_at, state_json, slice_hash) VALUES ('cus_1', '', 1, 1, 1, '{}', 'h')";

const countRows = ({ path }: { path: string }) => {
	const database = new Database(path, { readonly: true, safeIntegers: true });
	const count = database
		.query<{ n: bigint }, []>("SELECT count(*) AS n FROM subject_states")
		.get()?.n;
	database.close();
	return count;
};

const writeGarbage = ({ path }: { path: string }) => {
	writeFileSync(path, Buffer.alloc(16_384, 7));
	writeFileSync(`${path}-wal`, Buffer.alloc(4_096, 9));
};

test("a file SQLite cannot read is removed, a readable one in any folder keeps its rows, and the removed one opens afresh", () => {
	const dataDir = join(root, "volume");
	mkdirSync(join(dataDir, "tenant_1"), { recursive: true });
	const garbage = join(dataDir, "tenant_1", "slot-001-of-016.sqlite");
	const readable = join(dataDir, "slot-002-of-016.sqlite");
	writeGarbage({ path: garbage });
	const database = openSlotDatabase({ databasePath: readable });
	database.run(ROW);
	database.close();
	const logged: string[] = [];

	removeUnreadableFiles({
		dataDir,
		logger: {
			error: (fields) => logged.push((fields as { type: string }).type),
		},
	});

	expect(logged).toEqual(["atom_file_unreadable"]);
	expect(existsSync(garbage)).toBe(false);
	expect(existsSync(`${garbage}-wal`)).toBe(false);
	expect(countRows({ path: readable })).toBe(1n);
	const fresh = openSlotDatabase({ databasePath: garbage });
	fresh.run(ROW);
	fresh.close();
	expect(countRows({ path: garbage })).toBe(1n);
});
