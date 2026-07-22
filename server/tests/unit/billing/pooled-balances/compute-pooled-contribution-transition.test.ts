import { expect, test } from "bun:test";
import { computePooledContributionTransition } from "@/internal/billing/v2/pooledBalances/compute/computePooledContributionTransition";

test.concurrent(
	"first attach contributes to the current and next cycle",
	() => {
		expect(
			computePooledContributionTransition({
				previous: null,
				desired: {
					currentCycleContribution: 500,
					nextCycleContribution: 500,
				},
			}),
		).toEqual({
			contributionDelta: 500,
			next: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		});
	},
);

test.concurrent("replaying the same desired contribution is idempotent", () => {
	expect(
		computePooledContributionTransition({
			previous: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
			desired: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		}),
	).toEqual({
		contributionDelta: 0,
		next: {
			currentCycleContribution: 500,
			nextCycleContribution: 500,
		},
	});
});

test.concurrent(
	"immediate removal subtracts the full current-cycle contribution",
	() => {
		expect(
			computePooledContributionTransition({
				previous: {
					currentCycleContribution: 500,
					nextCycleContribution: 500,
				},
				desired: {
					currentCycleContribution: 0,
					nextCycleContribution: 0,
				},
			}),
		).toEqual({
			contributionDelta: -500,
			next: {
				currentCycleContribution: 0,
				nextCycleContribution: 0,
			},
		});
	},
);

test.concurrent(
	"scheduled cancellation and uncancel do not remint the current cycle",
	() => {
		const scheduled = computePooledContributionTransition({
			previous: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
			desired: {
				currentCycleContribution: 500,
				nextCycleContribution: 0,
			},
		});
		const uncanceled = computePooledContributionTransition({
			previous: scheduled.next,
			desired: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		});

		expect(scheduled).toEqual({
			contributionDelta: 0,
			next: {
				currentCycleContribution: 500,
				nextCycleContribution: 0,
			},
		});
		expect(uncanceled).toEqual({
			contributionDelta: 0,
			next: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		});
	},
);

test.concurrent(
	"remove then reattach has zero net contribution even after usage",
	() => {
		const removed = computePooledContributionTransition({
			previous: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
			desired: {
				currentCycleContribution: 0,
				nextCycleContribution: 0,
			},
		});
		const reattached = computePooledContributionTransition({
			previous: removed.next,
			desired: {
				currentCycleContribution: 500,
				nextCycleContribution: 500,
			},
		});

		const balanceAfterUsage = 300;
		const balanceAfterRemoval = balanceAfterUsage + removed.contributionDelta;
		const balanceAfterReattach =
			balanceAfterRemoval + reattached.contributionDelta;

		expect(removed.contributionDelta).toBe(-500);
		expect(balanceAfterRemoval).toBe(-200);
		expect(reattached.contributionDelta).toBe(500);
		expect(balanceAfterReattach).toBe(300);
	},
);

test.concurrent("quantity changes apply only their exact delta", () => {
	const increased = computePooledContributionTransition({
		previous: {
			currentCycleContribution: 500,
			nextCycleContribution: 500,
		},
		desired: {
			currentCycleContribution: 800,
			nextCycleContribution: 800,
		},
	});
	const decreased = computePooledContributionTransition({
		previous: {
			currentCycleContribution: 500,
			nextCycleContribution: 500,
		},
		desired: {
			currentCycleContribution: 200,
			nextCycleContribution: 200,
		},
	});

	expect(increased.contributionDelta).toBe(300);
	expect(decreased.contributionDelta).toBe(-300);
});

test.concurrent(
	"decimal contribution deltas do not accumulate float error",
	() => {
		expect(
			computePooledContributionTransition({
				previous: {
					currentCycleContribution: 0.1,
					nextCycleContribution: 0.1,
				},
				desired: {
					currentCycleContribution: 0.3,
					nextCycleContribution: 0.3,
				},
			}).contributionDelta,
		).toBe(0.2);
	},
);

test.concurrent("contributions must be finite and non-negative", () => {
	for (const invalidContribution of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	]) {
		expect(() =>
			computePooledContributionTransition({
				previous: null,
				desired: {
					currentCycleContribution: invalidContribution,
					nextCycleContribution: 500,
				},
			}),
		).toThrow("currentCycleContribution must be finite and non-negative");
	}
});
