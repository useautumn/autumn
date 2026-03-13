import { expect } from "bun:test";
import {
	type BillingPreviewChange,
	type BillingPreviewResponse,
	formatMs,
	type PreviewUpdateSubscriptionResponse,
} from "@autumn/shared";

type PreviewChangeExpectation = {
	planId: string;
	featureQuantities?: Array<{ feature_id: string; quantity: number }>;
	effectiveAt?: number | null;
	effectiveAtToleranceMs?: number;
};

type ExpectPreviewChangesParams = {
	preview: BillingPreviewResponse | PreviewUpdateSubscriptionResponse;
	incoming?: PreviewChangeExpectation[];
	outgoing?: PreviewChangeExpectation[];
	debug?: boolean;
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

const logPreviewChanges = ({
	changes,
	label,
}: {
	changes: BillingPreviewChange[];
	label: string;
}) => {
	console.log(`\n${label} (${changes.length})`);

	for (const change of changes) {
		const effectiveAt =
			change.effective_at === null
				? "null"
				: new Date(change.effective_at).toISOString();

		console.log(`  ├─ ${change.plan_id}  effective_at=${effectiveAt}`);

		if (change.feature_quantities.length === 0) {
			console.log("  │  └─ no feature quantities");
			continue;
		}

		for (let index = 0; index < change.feature_quantities.length; index++) {
			const featureQuantity = change.feature_quantities[index];
			const branch =
				index === change.feature_quantities.length - 1 ? "└─" : "├─";
			console.log(
				`  │  ${branch} ${featureQuantity.feature_id}: ${featureQuantity.quantity}`,
			);
		}
	}
};

const expectPreviewChange = ({
	change,
	expected,
}: {
	change: BillingPreviewChange | undefined;
	expected: PreviewChangeExpectation;
}) => {
	expect(change).toBeDefined();

	if (!change) {
		return;
	}

	if (expected.featureQuantities) {
		expect(change.feature_quantities).toEqual(
			expect.arrayContaining(expected.featureQuantities),
		);
	}

	if (expected.effectiveAt !== undefined) {
		if (expected.effectiveAt === null) {
			expect(change.effective_at).toBeNull();
			return;
		}

		const actualEffectiveAt = change.effective_at;
		const toleranceMs = expected.effectiveAtToleranceMs ?? TEN_MINUTES_MS;

		expect(actualEffectiveAt).toBeDefined();
		expect(actualEffectiveAt).not.toBeNull();

		const diff = Math.abs((actualEffectiveAt ?? 0) - expected.effectiveAt);

		expect(
			diff,
			`effectiveAt mismatch for ${expected.planId}: expected ${formatMs(expected.effectiveAt)}, got ${formatMs(actualEffectiveAt ?? 0)}`,
		).toBeLessThanOrEqual(toleranceMs);
	}
};

export const expectPreviewChanges = ({
	preview,
	incoming = [],
	outgoing = [],
	debug = true,
}: ExpectPreviewChangesParams) => {
	if (debug) {
		logPreviewChanges({ changes: preview.incoming, label: "PREVIEW INCOMING" });
		logPreviewChanges({ changes: preview.outgoing, label: "PREVIEW OUTGOING" });
	}

	expect(preview.incoming).toHaveLength(incoming.length);
	expect(preview.outgoing).toHaveLength(outgoing.length);

	for (const expected of incoming) {
		expectPreviewChange({
			change: preview.incoming.find(
				(change) => change.plan_id === expected.planId,
			),
			expected,
		});
	}

	for (const expected of outgoing) {
		expectPreviewChange({
			change: preview.outgoing.find(
				(change) => change.plan_id === expected.planId,
			),
			expected,
		});
	}
};
