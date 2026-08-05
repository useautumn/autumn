export const BILLING_OPERATIONS = {
	attach: {
		path: "/v1/billing.attach",
		previewPath: "/v1/billing.preview_attach",
	},
	updateSubscription: {
		path: "/v1/billing.update",
		previewPath: "/v1/billing.preview_update",
	},
	multiAttach: {
		path: "/v1/billing.multi_attach",
		previewPath: "/v1/billing.preview_multi_attach",
	},
	createSchedule: {
		path: "/v1/billing.create_schedule",
		previewPath: "/v1/billing.preview_create_schedule",
	},
} as const;
