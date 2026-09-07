import { expect, test } from "bun:test";
import { possibleRenameHint } from "../src/actions/push";

const preview = (rows: {
	features?: { featureId: string; action: string }[];
	plans?: { planId: string; action: string }[];
}) => rows as never;

test("a delete beside an id-less create is noted as a possible rename", () => {
	const hint = possibleRenameHint({
		preview: preview({
			plans: [
				{ planId: "pro", action: "delete" },
				{ planId: "proNew", action: "create" },
			],
		}),
		wire: { plans: [{ plan_id: "proNew" }] },
	});
	expect(hint).toContain("removes plan pro and creates proNew");
	expect(hint).toContain("pull first");
});

test("a create that carries its internalId is a rename the server understands", () => {
	const hint = possibleRenameHint({
		preview: preview({
			plans: [
				{ planId: "pro", action: "delete" },
				{ planId: "proNew", action: "create" },
			],
		}),
		wire: { plans: [{ plan_id: "proNew", internal_id: "prod_1" }] },
	});
	expect(hint).toBeNull();
});

test("a delete on its own, or a create on its own, is not a rename", () => {
	expect(
		possibleRenameHint({
			preview: preview({
				features: [{ featureId: "seats", action: "delete" }],
			}),
			wire: { features: [] },
		}),
	).toBeNull();
	expect(
		possibleRenameHint({
			preview: preview({
				features: [{ featureId: "seats", action: "create" }],
			}),
			wire: { features: [{ feature_id: "seats" }] },
		}),
	).toBeNull();
});
