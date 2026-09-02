import { CusProductStatus, type FullCusProduct } from "@autumn/shared";

export const computeExpireUnusedLicenseAssignmentUpdates = ({
	assignments,
	endedAt,
}: {
	assignments: FullCusProduct[];
	endedAt: number;
}) =>
	assignments.map((customerProduct) => ({
		customerProduct,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: endedAt,
		},
	}));
