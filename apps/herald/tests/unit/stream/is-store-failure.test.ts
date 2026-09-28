import { expect, test } from "bun:test";
import { TinybirdIngestError } from "@autumn/tinybird";
import { isStoreFailure } from "../../../src/stream/landRecords/isStoreFailure.js";

const socketError = (code: string): Error =>
	Object.assign(new Error("socket closed"), { code });

test("a Tinybird ingest failure is judged by what caused it", () => {
	expect(
		isStoreFailure(
			new TinybirdIngestError({
				writtenRows: 2_000,
				cause: socketError("ECONNRESET"),
			}),
		),
	).toBe(true);
	expect(
		isStoreFailure(
			new TinybirdIngestError({
				writtenRows: 0,
				cause: new TypeError("row is not an object"),
			}),
		),
	).toBe(false);
});
