import type { ToolCall } from "./context.js";

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const records = (value: unknown) =>
	Array.isArray(value) ? value.map(record) : [];

export const resolveRequestIdentities = ({
	actions,
	evidence,
}: {
	actions: ToolCall[];
	evidence: unknown;
}): ToolCall[] => {
	const details = records(record(evidence).details);
	return actions.map((original) => {
		const call = structuredClone(original);
		const request = record(call.args.request);
		if (!["attach", "updateSubscription", "updateCustomer"].includes(call.name))
			return call;
		if (typeof request.customer_id !== "string" || !request.customer_id.trim())
			throw new Error(
				"A customer identity is required before proposing this action",
			);
		const entity = typeof request.entity_id === "string";
		const owners = details.filter((detail) => {
			if (detail.name !== (entity ? "getEntity" : "getCustomer")) return false;
			const lookup = record(record(detail.args).request);
			const result = record(detail.result);
			return (
				lookup.customer_id === request.customer_id &&
				(!entity || lookup.entity_id === request.entity_id) &&
				result.id === (entity ? request.entity_id : request.customer_id) &&
				(!entity ||
					result.customer_id == null ||
					result.customer_id === request.customer_id)
			);
		});
		const listedCustomer = records(
			record(record(record(evidence).facts).listCustomers).list,
		).some((customer) => customer.id === request.customer_id);
		if (call.name === "updateCustomer" && !owners.length && !listedCustomer)
			throw new Error(
				"Customer update requires an observed existing customer; do not propose updates for an unknown target",
			);
		if (call.name === "updateCustomer") return call;
		const owner = owners.at(-1);
		const subscriptions = records(
			owner && record(owner.result).subscriptions,
		).filter(
			(subscription) =>
				["active", "scheduled"].includes(String(subscription.status)) &&
				(subscription.scope === undefined ||
					subscription.scope === (entity ? "entity" : "customer")),
		);
		if (call.name === "attach") {
			if (
				subscriptions.some(
					(subscription) => subscription.plan_id === request.plan_id,
				)
			)
				throw new Error(
					"This recurring plan is already attached at the requested scope. Modify its existing subscription with updateSubscription instead of attaching it again.",
				);
			return call;
		}
		if (request.customer_product_id !== undefined)
			throw new Error(
				"Internal customer_product_id cannot override the observed subscription identity; use subscription_id or plan_id",
			);
		const matching = subscriptions.filter((subscription) =>
			request.subscription_id
				? subscription.id === request.subscription_id
				: subscription.plan_id === request.plan_id,
		);
		if (matching.length !== 1)
			throw new Error(
				"Subscription update requires exactly one observed subscription at the requested customer/entity scope; resolve the target before proposing it",
			);
		const subscription = matching[0];
		if (typeof subscription.plan_id !== "string")
			throw new Error("Observed subscription has no plan identity");
		if (
			request.plan_id !== undefined &&
			request.plan_id !== subscription.plan_id
		)
			throw new Error(
				"The proposed subscription ID and plan ID refer to different subscriptions",
			);
		request.plan_id = subscription.plan_id;
		call.args.request = request;
		return call;
	});
};
