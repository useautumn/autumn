import { describe, expect, test } from "bun:test";
import type {
	ApiBalanceV1,
	PreviewBalance,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import chalk from "chalk";
import {
	diffPhaseBalances,
	type PhaseBalances,
} from "@/internal/billing/v2/actions/setPlans/preview/diffPhaseBalances";

const balance = (fields: Partial<PreviewBalance>) =>
	({
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		next_reset_at: null,
		...fields,
	}) as ApiBalanceV1;

const credits = (fields: Partial<PreviewBalance>): PhaseBalances => ({
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
			name: "usage cleared across a grant change is reset",
			before: credits({ granted: 500, remaining: 260, usage: 240 }),
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
			},
			previous_attributes: { granted: 100, remaining: 60 },
			behavior: "carried",
		});
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
		});
		expect(change?.previous_attributes).toEqual({
			granted: 100,
			remaining: 60,
			usage: 40,
		});
	});
});
