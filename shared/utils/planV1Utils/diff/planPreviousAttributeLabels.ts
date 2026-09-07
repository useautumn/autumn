/** Human labels for the scalar plan fields `previous_attributes` can name.
 * The dashboard and the CLI both render from this one map. */
export const PLAN_PREVIOUS_ATTRIBUTE_LABELS: Record<string, string> = {
	name: "Name",
	description: "Description",
	group: "Group",
	add_on: "Add-on",
	auto_enable: "Default plan",
	free_trial: "Free trial",
	config: "Config",
	billing_controls: "Billing controls",
	processors: "Stripe mapping",
};
