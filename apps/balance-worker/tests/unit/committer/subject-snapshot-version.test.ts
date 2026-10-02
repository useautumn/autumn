import { expect, test } from "bun:test";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import { z } from "zod/v4";
import { subjectStateSchema } from "../../../../../packages/balance-engine/src/models/subject/subjectState.js";

/** Every shape SubjectState has had, by the version written beside it. A new shape is a new entry with a new version. */
const VERSION_BY_SCHEMA_SHA256: Record<string, number> = {
	"8312cc467867b650a6ed2e5d04c4db9b41184535708b796f2de1e193bce258f8": 1,
};

const currentSchemaSha256 = () => {
	const schema = JSON.stringify(
		z.toJSONSchema(subjectStateSchema, { io: "input", unrepresentable: "any" }),
	);
	return new Bun.CryptoHasher("sha256").update(schema).digest("hex");
};

test("a snapshot's state_version moves whenever SubjectState's shape does", () => {
	const sha256 = currentSchemaSha256();
	expect(
		VERSION_BY_SCHEMA_SHA256[sha256],
		`SubjectState's shape changed (sha256 ${sha256}); add it with the next version and bump the constant`,
	).toBe(BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION);
});

test("no two shapes share a version, so re-pinning a hash cannot keep the old number", () => {
	const versions = Object.values(VERSION_BY_SCHEMA_SHA256);
	expect(new Set(versions).size).toBe(versions.length);
	expect(Math.max(...versions)).toBe(BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION);
});
