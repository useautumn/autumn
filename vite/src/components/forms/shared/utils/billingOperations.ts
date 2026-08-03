export const BILLING_OPERATIONS = {
	attach: {
		path: "/v1/billing.attach",
		previewPath: "/v1/billing.preview_attach",
		invalidatesSchedule: false,
	},
	multiAttach: {
		path: "/v1/billing.multi_attach",
		previewPath: "/v1/billing.preview_multi_attach",
		invalidatesSchedule: true,
	},
	createSchedule: {
		path: "/v1/billing.create_schedule",
		previewPath: "/v1/billing.preview_create_schedule",
		invalidatesSchedule: true,
	},
} as const;
