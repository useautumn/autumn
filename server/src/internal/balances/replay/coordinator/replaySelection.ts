import { createHash } from "node:crypto";
import type { ReplayHydrationSelection } from "../replayHydrationContracts.js";
import { ReplayHydrationInvalidSelectionError } from "../replayHydrationErrors.js";

export type NormalizedSelection = Readonly<{
	identity: Readonly<ReplayHydrationSelection["identity"]>;
	baseline: Readonly<ReplayHydrationSelection["baseline"]>;
	featureIds: readonly string[];
}>;

function requireNonEmptyString({
	name,
	value,
}: {
	name: string;
	value: string;
}): string {
	if (value.length === 0) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: `${name} must be nonempty`,
		});
	}
	return value;
}

export function normalizeSelection({
	selection,
}: {
	selection: ReplayHydrationSelection;
}): NormalizedSelection {
	const featureIds = [...new Set(selection.featureIds)].sort();
	if (featureIds.length === 0) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: "featureIds must contain at least one feature",
		});
	}
	for (const featureId of featureIds)
		requireNonEmptyString({ name: "featureId", value: featureId });
	const capturedAtMs = selection.baseline.capturedAtMs;
	if (!Number.isSafeInteger(capturedAtMs) || capturedAtMs < 0) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: "baseline.capturedAtMs must be a nonnegative safe integer",
		});
	}
	const normalized: NormalizedSelection = {
		identity: Object.freeze({
			orgId: requireNonEmptyString({
				name: "identity.orgId",
				value: selection.identity.orgId,
			}),
			env: selection.identity.env,
			customerId: requireNonEmptyString({
				name: "identity.customerId",
				value: selection.identity.customerId,
			}),
		}),
		baseline: Object.freeze({
			id: requireNonEmptyString({
				name: "baseline.id",
				value: selection.baseline.id,
			}),
			capturedAtMs,
		}),
		featureIds: Object.freeze(featureIds),
	};
	return Object.freeze(normalized);
}

export function identityKeyOf({
	selection,
}: {
	selection: NormalizedSelection;
}): string {
	return JSON.stringify([
		selection.identity.orgId,
		selection.identity.env,
		selection.identity.customerId,
	]);
}

export function selectionKeyOf({
	selection,
}: {
	selection: NormalizedSelection;
}): string {
	return JSON.stringify([
		selection.baseline.id,
		selection.baseline.capturedAtMs,
		selection.identity.orgId,
		selection.identity.env,
		selection.identity.customerId,
		selection.featureIds,
	]);
}

export function initializationIdOf({
	selection,
}: {
	selection: NormalizedSelection;
}): string {
	return `replay:${createHash("sha256")
		.update(selectionKeyOf({ selection }))
		.digest("hex")}`;
}

export function identitiesEqual({
	left,
	right,
}: {
	left: ReplayHydrationSelection["identity"];
	right: ReplayHydrationSelection["identity"];
}): boolean {
	return (
		left.orgId === right.orgId &&
		left.env === right.env &&
		left.customerId === right.customerId
	);
}
