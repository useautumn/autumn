import { describe, expect, test } from "bun:test";
import { resolveSelectedBasePlanId } from "@/views/products/plan/hooks/useVariantLinkVisibility";

describe("resolveSelectedBasePlanId", () => {
	test("undefined editor field keeps the persisted pointer", () => {
		expect(
			resolveSelectedBasePlanId({
				editedBasePlanId: undefined,
				persistedBasePlanId: "team",
				planId: "pro",
			}),
		).toBe("team");
	});

	test("a newly picked base is pending until it matches persisted", () => {
		expect(
			resolveSelectedBasePlanId({
				editedBasePlanId: "team",
				persistedBasePlanId: null,
				planId: "pro",
			}),
		).toBe("team");
	});

	test("null detaches even when a persisted pointer exists", () => {
		expect(
			resolveSelectedBasePlanId({
				editedBasePlanId: null,
				persistedBasePlanId: "team",
				planId: "pro_eu",
			}),
		).toBeNull();
	});

	test("after save, pending id matching persisted is still that id", () => {
		expect(
			resolveSelectedBasePlanId({
				editedBasePlanId: "team",
				persistedBasePlanId: "team",
				planId: "pro",
			}),
		).toBe("team");
	});
});
