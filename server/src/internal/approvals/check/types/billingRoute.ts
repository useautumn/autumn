/** The billing route a request came through; the approval action follows from it and the change. */
export type BillingRoute =
	| "billing.attach"
	| "billing.update"
	| "billing.set_plans"
	| "billing.create_schedule"
	| "billing.multi_attach"
	| "billing.multi_update";
