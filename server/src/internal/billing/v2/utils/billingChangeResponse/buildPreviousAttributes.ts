import type {
	CustomerProductUpdateSchema,
	FullCusProduct,
} from "@autumn/shared";
import type { z } from "zod/v4";

type CustomerProductUpdate = z.infer<typeof CustomerProductUpdateSchema>;

export const buildPreviousAttributes = ({
	originalCusProduct,
	updates,
}: {
	originalCusProduct: FullCusProduct;
	updates: CustomerProductUpdate["updates"];
}): Record<string, unknown> => {
	const previous: Record<string, unknown> = {};

	if (
		updates.status !== undefined &&
		updates.status !== originalCusProduct.status
	) {
		previous.status = originalCusProduct.status;
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

	return previous;
};
