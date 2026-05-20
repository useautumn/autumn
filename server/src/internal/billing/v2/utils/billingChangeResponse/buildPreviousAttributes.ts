import {
	CusProductStatus,
	type CustomerProductUpdateSchema,
	type FullCusProduct,
} from "@autumn/shared";
import type { z } from "zod/v4";
import { cusProductStatusToPublicStatus } from "./cusProductStatusMapping";

type CustomerProductUpdate = z.infer<typeof CustomerProductUpdateSchema>;

const isPastDue = (status: CusProductStatus | undefined): boolean =>
	status === CusProductStatus.PastDue;

export const buildPreviousAttributes = ({
	originalCusProduct,
	updates,
}: {
	originalCusProduct: FullCusProduct;
	updates: CustomerProductUpdate["updates"];
}): Record<string, unknown> => {
	const previous: Record<string, unknown> = {};

	// Surface-level `status` diff: only emit if the public status differs.
	// (Trialing↔Active, PastDue↔Active both map to "active" publicly, so they
	// don't show here — they show via past_due / trial_ends_at instead.)
	if (updates.status !== undefined) {
		const beforePublic = cusProductStatusToPublicStatus(
			originalCusProduct.status,
		);
		const afterPublic = cusProductStatusToPublicStatus(updates.status);
		if (beforePublic !== afterPublic) {
			previous.status = beforePublic;
		}

		// past_due flag flip
		const beforePastDue = isPastDue(originalCusProduct.status);
		const afterPastDue = isPastDue(updates.status);
		if (beforePastDue !== afterPastDue) {
			previous.past_due = beforePastDue;
		}
	}

	const originalCanceledAt = originalCusProduct.canceled_at ?? null;
	if (
		updates.canceled_at !== undefined &&
		updates.canceled_at !== originalCanceledAt
	) {
		previous.canceled_at = originalCanceledAt;
	}

	const originalEndedAt = originalCusProduct.ended_at ?? null;
	if (updates.ended_at !== undefined && updates.ended_at !== originalEndedAt) {
		previous.expires_at = originalEndedAt;
	}

	const originalTrialEndsAt = originalCusProduct.trial_ends_at ?? null;
	if (
		updates.trial_ends_at !== undefined &&
		updates.trial_ends_at !== originalTrialEndsAt
	) {
		previous.trial_ends_at = originalTrialEndsAt;
	}

	return previous;
};
