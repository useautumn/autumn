import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import {
	getFilterSummary,
	includedFilterInputValue,
	setItemFilterIncluded,
} from "@/views/migrations/migration/operations/operationItemUtils";

const features = [{ id: "messages", name: "Messages" }] as Feature[];

describe("ItemFilter included", () => {
	test("empty input is omitted; 0 is a real grant", () => {
		expect(includedFilterInputValue(undefined)).toBe("");
		expect(includedFilterInputValue(0)).toBe("0");
		expect(includedFilterInputValue(100)).toBe("100");
	});

	test("clearing included drops the key instead of writing 0", () => {
		expect(
			setItemFilterIncluded({
				filter: { feature_id: "messages", included: 0 },
				included: undefined,
			}),
		).toEqual({ feature_id: "messages" });
		expect(
			setItemFilterIncluded({
				filter: { feature_id: "messages" },
				included: 0,
			}),
		).toEqual({ feature_id: "messages", included: 0 });
	});

	test("summary shows 0 included and hides omitted included", () => {
		expect(getFilterSummary({ feature_id: "messages" }, features)).toBe(
			"Messages",
		);
		expect(
			getFilterSummary({ feature_id: "messages", included: 0 }, features),
		).toBe("Messages · 0 included");
		expect(
			getFilterSummary({ feature_id: "messages", included: 100 }, features),
		).toBe("Messages · 100 included");
	});
});
