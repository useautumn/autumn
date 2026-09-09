import { describe, expect, test } from "bun:test";
import { mergeEntityMetadata } from "@/internal/entities/actions/mergeEntityMetadata.js";

describe("mergeEntityMetadata", () => {
	test("merges new keys and overwrites existing ones", () => {
		expect(
			mergeEntityMetadata({
				existing: { provisioned_through: "aws", region: "us-east-1" },
				incoming: { region: "us-west-2", owner: "suger" },
			}),
		).toEqual({
			provisioned_through: "aws",
			region: "us-west-2",
			owner: "suger",
		});
	});

	test("deletes keys set to null", () => {
		expect(
			mergeEntityMetadata({
				existing: { keep: "yes", drop: "no" },
				incoming: { drop: null },
			}),
		).toEqual({ keep: "yes" });
	});

	test("treats a missing existing bag as empty", () => {
		expect(
			mergeEntityMetadata({
				existing: null,
				incoming: { provisioned_through: "aws" },
			}),
		).toEqual({ provisioned_through: "aws" });
	});
});
