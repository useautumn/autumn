import { expect, test } from "bun:test";
import { receiptCleanupRequiresRecovery } from "../../../../src/checkpoint/scheduling/receiptCleanupFailure.js";

test.concurrent.each([
	["SQLITE_CORRUPT", true],
	["SQLITE_CORRUPT_INDEX", true],
	["SQLITE_NOTADB", true],
	["SQLITE_CONSTRAINT_FOREIGNKEY", true],
	["SQLITE_MISUSE", true],
	["SQLITE_BUSY", false],
	["SQLITE_LOCKED", false],
	["SQLITE_FULL", false],
	["SQLITE_READONLY", false],
] as const)(
	"classifies SQLite cleanup code %s as recovery=%s",
	(code, expected) => {
		expect(
			receiptCleanupRequiresRecovery({
				cause: Object.assign(new Error("delete failed"), { code }),
			}),
		).toBe(expected);
	},
);

test.concurrent(
	"does not infer database corruption from an arbitrary error message",
	() => {
		expect(
			receiptCleanupRequiresRecovery({
				cause: new Error("SQLITE_CORRUPT appeared in a log"),
			}),
		).toBe(false);
	},
);
