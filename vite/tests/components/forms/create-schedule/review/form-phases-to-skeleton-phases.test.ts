import { expect, test } from "bun:test";
import { formPhasesToSkeletonPhases } from "@/components/forms/create-schedule/utils/review/formPhasesToSkeletonPhases";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";

const plan = (productId: string, entityId: string | null = null) => ({
	productId,
	entityId,
});

test("the skeleton mirrors each phase's scopes and plan counts, in review order", () => {
	const phases = [
		{
			startsAt: null,
			plans: [
				plan("pro"),
				plan("seats", "ent-1"),
				plan("growth"),
				plan("seats", "ent-2"),
				plan(""),
			],
		},
		{ startsAt: 1_790_000_000_000, plans: [plan("")] },
	] as unknown as CustomerStatePhase[];

	expect(formPhasesToSkeletonPhases({ phases })).toEqual([
		[
			{ entityId: null, rowCount: 2 },
			{ entityId: "ent-1", rowCount: 1 },
			{ entityId: "ent-2", rowCount: 1 },
		],
		[{ entityId: null, rowCount: 1 }],
	]);
});
