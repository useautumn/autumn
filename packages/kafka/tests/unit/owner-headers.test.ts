import { describe, expect, test } from "bun:test";
import { InvalidRecordError } from "../../src/lib/recordErrors.js";
import { OWNER_EPOCH_HEADER } from "../../src/producer/sendIdempotentBatch.js";
import { OWNER_FENCE_HEADER } from "../../src/producer/sendOwnerFence.js";
import { readOwnerHeaders } from "../../src/topics/metering/ownerHeaders.js";

describe("owner headers", () => {
	test("no headers, or none of ours, is a transactional record: no epoch, not a fence", () => {
		expect(readOwnerHeaders({})).toEqual({ fence: false });
		expect(readOwnerHeaders({ headers: {} })).toEqual({ fence: false });
		expect(readOwnerHeaders({ headers: { other: "1" } })).toEqual({
			fence: false,
		});
	});

	test("the epoch reads as a bigint whether Kafka hands it over as text, bytes or a list", () => {
		expect(
			readOwnerHeaders({ headers: { [OWNER_EPOCH_HEADER]: "2516" } }),
		).toEqual({ ownerEpoch: 2516n, fence: false });
		expect(
			readOwnerHeaders({
				headers: { [OWNER_EPOCH_HEADER]: Buffer.from("7", "utf8") },
			}),
		).toEqual({ ownerEpoch: 7n, fence: false });
		expect(
			readOwnerHeaders({ headers: { [OWNER_EPOCH_HEADER]: ["9", "8"] } }),
		).toEqual({ ownerEpoch: 9n, fence: false });
	});

	test("a fence header marks the record as a fence under its epoch", () => {
		expect(
			readOwnerHeaders({
				headers: { [OWNER_EPOCH_HEADER]: "3", [OWNER_FENCE_HEADER]: "1" },
			}),
		).toEqual({ ownerEpoch: 3n, fence: true });
	});

	test("a fence without an epoch, or an epoch that is not a number, is an invalid record", () => {
		expect(() =>
			readOwnerHeaders({ headers: { [OWNER_FENCE_HEADER]: "1" } }),
		).toThrow(InvalidRecordError);
		expect(() =>
			readOwnerHeaders({ headers: { [OWNER_EPOCH_HEADER]: "-1" } }),
		).toThrow(InvalidRecordError);
		expect(() =>
			readOwnerHeaders({ headers: { [OWNER_EPOCH_HEADER]: "" } }),
		).toThrow(InvalidRecordError);
	});
});
