const ATTACH_PATHS = {
	attach: "/v1/billing.attach",
	previewAttach: "/v1/billing.preview_attach",
	createSchedule: "/v1/billing.create_schedule",
	previewCreateSchedule: "/v1/billing.preview_create_schedule",
} as const;

export function getAttachBillingPath({
	isMultiPlan,
	preview = false,
}: {
	isMultiPlan: boolean;
	preview?: boolean;
}) {
	if (isMultiPlan) {
		return preview
			? ATTACH_PATHS.previewCreateSchedule
			: ATTACH_PATHS.createSchedule;
	}
	return preview ? ATTACH_PATHS.previewAttach : ATTACH_PATHS.attach;
}
