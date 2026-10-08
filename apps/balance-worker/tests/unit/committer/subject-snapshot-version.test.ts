import { expect, test } from "bun:test";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import { z } from "zod/v4";
import { subjectStateSchema } from "../../../../../packages/balance-engine/src/models/subject/subjectState.js";

/** Every shape SubjectState has had, by the version written beside it. A new shape is a new entry with a new version. */
const VERSION_BY_SCHEMA_SHA256: Record<string, number> = {
	"3c3a4d72a84befab0db7be7952b5dc73a1b323eb7ac5c09dc96f2324b275e060": 1,
	"29adcf623cf0935d3a64bec41512b4ee5cfd02af4d13552dc432c2103914e10f": 2,
};

// Output, not input: a snapshot serialises the parsed state, where defaulted fields are present.
const currentSchemaSha256 = () => {
	const schema = JSON.stringify(
		z.toJSONSchema(subjectStateSchema, {
			io: "output",
			unrepresentable: "any",
		}),
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
