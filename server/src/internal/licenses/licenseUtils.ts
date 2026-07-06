import { CusProductStatus } from "@autumn/shared";

// PastDue retains pools/assignments/grants (dunning must not revoke seats);
// new assignments still require an assignable status.
export const licensePoolParentStatuses = [
	CusProductStatus.Active,
	CusProductStatus.Trialing,
	CusProductStatus.PastDue,
];

export const licenseAssignableStatuses = [
	CusProductStatus.Active,
	CusProductStatus.Trialing,
];

export const isLicensePoolParentStatus = ({
	status,
}: {
	status: string | null;
}) => licensePoolParentStatuses.includes(status as CusProductStatus);

export const isLicenseAssignableStatus = ({
	status,
}: {
	status: string | null;
}) => licenseAssignableStatuses.includes(status as CusProductStatus);

export const computeLicenseInventory = ({
	included,
	assigned,
}: {
	included: number;
	assigned: number;
}) => ({
	included,
	assigned,
	available: Math.max(0, included - assigned),
});
