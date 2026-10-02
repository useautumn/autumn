import { describe, expect, test } from "bun:test";
import type {
	ApiBalanceV1,
	SetPlansPreviewBalance,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import chalk from "chalk";
import {
	diffPhaseBalances,
	type PhaseBalances,
} from "@/internal/billing/v2/actions/setPlans/preview/diffPhaseBalances";

const balance = (fields: Partial<SetPlansPreviewBalance>) =>
	({
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		next_reset_at: null,
		overage_allowed: false,
		...fields,
	}) as ApiBalanceV1;

const credits = (fields: Partial<SetPlansPreviewBalance>): PhaseBalances => ({
	credits: balance(fields),
});

const NO_CREDITS: PhaseBalances = {};

const behaviorOf = ({
	before,
	after,
}: {
	before: PhaseBalances;
	after: PhaseBalances;
}) => diffPhaseBalances({ before, after }).map((change) => change.behavior);

describe(chalk.yellowBright("diffPhaseBalances"), () => {
	const cases: {
		name: string;
		before: PhaseBalances;
		after: PhaseBalances;
		behaviors: SetPlansPreviewBalanceChange["behavior"][];
	}[] = [
		{
			name: "a feature the customer gains is added",
			before: NO_CREDITS,
			after: credits({ granted: 100, remaining: 100 }),
			behaviors: ["added"],
		},
		{
			name: "a feature the customer loses is removed",
			before: credits({ granted: 100, remaining: 60, usage: 40 }),
			after: NO_CREDITS,
			behaviors: ["removed"],
		},
		{
			name: "gaining unlimited access from none is added",
			before: credits({}),
			after: credits({ unlimited: true }),
			behaviors: ["added"],
		},
		{
			name: "losing unlimited access to nothing is removed",
			before: credits({ unlimited: true }),
			after: credits({}),
			behaviors: ["removed"],
		},
		{
			name: "limited to unlimited is updated",
			before: credits({ granted: 100, remaining: 100 }),
			after: credits({ unlimited: true }),
			behaviors: ["updated"],
		},
		{
			name: "unlimited to limited is updated",
			before: credits({ unlimited: true }),
			after: credits({ granted: 100, remaining: 100 }),
			behaviors: ["updated"],
		},
		{
			name: "usage cleared across a grant change is updated",
			before: credits({ granted: 500, remaining: 260, usage: 240 }),
			after: credits({ granted: 100, remaining: 100 }),
			behaviors: ["updated"],
		},
		{
			name: "usage cleared with the same grant is reset",
			before: credits({ granted: 100, remaining: 40, usage: 60 }),
			after: credits({ granted: 100, remaining: 100 }),
			behaviors: ["reset"],
		},
		{
			name: "usage kept across a grant change is carried",
			before: credits({ granted: 100, remaining: 0, usage: 100 }),
			after: credits({ granted: 500, remaining: 400, usage: 100 }),
			behaviors: ["carried"],
		},
		{
			name: "a grant change with no usage is updated",
			before: credits({ granted: 100, remaining: 100 }),
			after: credits({ granted: 200, remaining: 200 }),
			behaviors: ["updated"],
		},
		{
			name: "a balance that grants nothing on either side is no change, even if its reset date moves",
			before: credits({ next_reset_at: 1_800_000_000_000 }),
			after: NO_CREDITS,
			behaviors: [],
		},
		{
			name: "an identical balance is no change",
			before: credits({ granted: 100, remaining: 60, usage: 40 }),
			after: credits({ granted: 100, remaining: 60, usage: 40 }),
			behaviors: [],
		},
		{
			name: "an empty balance appearing is no change",
			before: NO_CREDITS,
			after: credits({}),
			behaviors: [],
		},
		{
			name: "a pay-per-use feature the customer gains is added",
			before: NO_CREDITS,
			after: credits({ overage_allowed: true }),
			behaviors: ["added"],
		},
		{
			name: "a pay-per-use feature with usage the customer loses is removed",
			before: credits({ overage_allowed: true, usage: 40 }),
			after: NO_CREDITS,
			behaviors: ["removed"],
		},
		{
			name: "an unused pay-per-use feature the customer loses is removed",
			before: credits({ overage_allowed: true }),
			after: NO_CREDITS,
			behaviors: ["removed"],
		},
		{
			name: "allowing overage on the same allowance is updated",
			before: credits({ granted: 100, remaining: 100 }),
			after: credits({ granted: 100, remaining: 100, overage_allowed: true }),
			behaviors: ["updated"],
		},
		{
			name: "remaining credits rebased onto a fresh grant are carried",
			before: credits({ granted: 500, remaining: 300, usage: 200 }),
			after: credits({ granted: 300, remaining: 300 }),
			behaviors: ["carried"],
		},
	];

	for (const { name, before, after, behaviors } of cases) {
		test(name, () => {
			expect(behaviorOf({ before, after })).toEqual(behaviors);
		});
	}

	test("previous attributes list only the fields that changed", () => {
		const [change] = diffPhaseBalances({
			before: credits({ granted: 100, remaining: 60, usage: 40 }),
			after: credits({ granted: 200, remaining: 160, usage: 40 }),
		});

		expect(change).toEqual({
			feature_id: "credits",
			balance: {
				granted: 200,
				remaining: 160,
				usage: 40,
				unlimited: false,
				next_reset_at: null,
				overage_allowed: false,
			},
			previous_attributes: { granted: 100, remaining: 60 },
			behavior: "carried",
		});
	});

	test("previous attributes overlaid on the balance reproduce the before state", () => {
		const before = credits({ granted: 100, remaining: 60, usage: 40 });
		const [change] = diffPhaseBalances({
			before,
			after: credits({ granted: 0, overage_allowed: true }),
		});

		expect({ ...change?.balance, ...change?.previous_attributes }).toEqual(
			before.credits as SetPlansPreviewBalance,
		);
	});

	test("a removed feature's after state is an empty balance", () => {
		const [change] = diffPhaseBalances({
			before: credits({ granted: 100, remaining: 60, usage: 40 }),
			after: NO_CREDITS,
		});

		expect(change?.balance).toEqual({
			granted: 0,
			remaining: 0,
			usage: 0,
			unlimited: false,
			next_reset_at: null,
			overage_allowed: false,
		});
		expect(change?.previous_attributes).toEqual({
			granted: 100,
			remaining: 60,
			usage: 40,
		});
	});
});
