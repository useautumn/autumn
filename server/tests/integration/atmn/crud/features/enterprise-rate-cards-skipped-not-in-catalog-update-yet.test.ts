import { test } from "bun:test";

// catalogV2.update accepts only features, plans and remove_plans — enterprise
// rate cards have no wire representation yet, so there is nothing to push.
test.todo(
	"enterprise rate cards — SKIPPED (not in catalog update yet)",
	() => {},
);
