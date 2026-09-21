import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import { parseRows, RowsInvalidError } from "../../../src/common/parseRows.js";

const schema = z.object({ id: z.string() });

describe("parseRows", () => {
	test("returns typed rows and names the table on an invalid one", () => {
		expect(
			parseRows({ table: "features", schema, rows: [{ id: "f_1" }] }),
		).toEqual([{ id: "f_1" }]);
		expect(() =>
			parseRows({ table: "features", schema, rows: [{ id: 1 }] }),
		).toThrow(RowsInvalidError);
	});
});
