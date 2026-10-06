import { expect, test } from "bun:test";
import { serializeMeteringRecord } from "@autumn/kafka";
import { createTrackMutation } from "../../../../../packages/kafka/tests/meteringFixtures.js";
import { createSharedRecordParser } from "../../../src/stream/createSharedRecordParser.js";

test("every job's consumer gets the one parse of a log record", () => {
	const parse = createSharedRecordParser();
	const encoded = serializeMeteringRecord({ record: createTrackMutation() });
	const position = { topic: "t", partition: 3, offset: 9n };
	const first = parse({ position, ...encoded });
	expect(parse({ position, ...encoded })).toBe(first);
	expect(
		parse({ position: { ...position, offset: 10n }, ...encoded }),
	).not.toBe(first);
});
