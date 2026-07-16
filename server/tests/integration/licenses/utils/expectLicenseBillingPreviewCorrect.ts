import { expect } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateProratedDiff,
	getBillingPeriod,
} from "@tests/integration/billing/utils/proration";

type LicenseBillingPreview = Pick<
	BillingPreviewResponse,
	"total" | "next_cycle"
>;

export const expectLicenseAttachPreviewCorrect = ({
	preview,
	total,
}: {
	preview: LicenseBillingPreview;
	total: number;
}) => {
	expect(preview.total).toEqual(total);
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});
};

export const expectLicenseUpdatePreviewCorrect = async ({
	preview,
	customerId,
	advancedTo,
	oldRecurringTotal,
	newRecurringTotal,
}: {
	preview: LicenseBillingPreview;
	customerId: string;
	advancedTo: number;
	oldRecurringTotal: number;
	newRecurringTotal: number;
}) => {
	const [expectedTotal, { billingPeriod }] = await Promise.all([
		calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: oldRecurringTotal,
			newAmount: newRecurringTotal,
		}),
		getBillingPeriod({ customerId }),
	]);

	expect(preview.total).toEqual(expectedTotal);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: billingPeriod.end,
		total: newRecurringTotal,
		toleranceMs: 1000,
	});
};
