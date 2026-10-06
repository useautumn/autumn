import { expect, test } from "bun:test";
import { parseMeteringRecord, serializeMeteringRecord } from "@autumn/kafka";
import { createTrackMutation } from "../../../../../packages/kafka/tests/meteringFixtures.js";
import { createSharedRecordParser } from "../../../src/stream/createSharedRecordParser.js";

test("herald's parse reads the same record the full schema does", () => {
	const parse = createSharedRecordParser();
	const encoded = serializeMeteringRecord({ record: createTrackMutation() });
	const position = { topic: "t", partition: 3, offset: 9n };
	expect(parse({ position, ...encoded })).toEqual(parseMeteringRecord(encoded));
});
