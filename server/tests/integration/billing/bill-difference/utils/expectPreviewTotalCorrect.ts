import { expect } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import { Decimal } from "decimal.js";

/** Preview totals are rounded to cents while expectations are computed from the period. */
export const expectPreviewTotalCorrect = ({
	preview,
	total,
}: {
	preview: Pick<BillingPreviewResponse, "total">;
	total: number;
}) => {
	const diff = new Decimal(preview.total).minus(total).abs().toNumber();
	expect(
		diff <= 0.01,
		`Preview total ${preview.total} should be within $0.01 of ${total}`,
	).toBe(true);
};
