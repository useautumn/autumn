import { asRecord, parsePreviewPayload } from "@autumn/render";

export const toJsonBlock = ({
	label,
	note,
	pretty = true,
	value,
}: {
	label: string;
	note?: string;
	pretty?: boolean;
	value: unknown;
}) =>
	`${label}${note ? ` (${note})` : ""}:\n\`\`\`json\n${JSON.stringify(value, null, pretty ? 2 : undefined)}\n\`\`\``;

const listOf = (value: unknown): Record<string, unknown>[] => {
	const unwrapped = Array.isArray(value)
		? value
		: (parsePreviewPayload(value) ?? value);
	const record = asRecord(unwrapped) ?? {};
	const list = [record.list, record.plans, record.features, unwrapped].find(
		Array.isArray,
	);
	return (list ?? []).map((entry) => asRecord(entry) ?? {});
};

const compactPrice = (price: unknown) => {
	const record = asRecord(price) ?? {};
	if (record.amount === undefined) return undefined;
	return `${record.amount}/${record.interval ?? "one_off"}`;
};

const compactInterval = (value: unknown) => {
	const record = asRecord(value) ?? {};
	if (!record.interval) return undefined;
	const count =
		typeof record.interval_count === "number" && record.interval_count > 1
			? `x${record.interval_count}`
			: "";
	return `${record.interval}${count}`;
};

const compactItem = (item: unknown) => {
	const record = asRecord(item) ?? {};
	const featureId = record.feature_id ?? record.id;
	if (typeof featureId !== "string") return undefined;
	const parts = [featureId];
	if (record.unlimited === true) {
		parts.push("unlimited");
	} else if (record.included !== undefined && record.included !== null) {
		parts.push(`included=${record.included}`);
	}
	const price = asRecord(record.price) ?? {};
	if (price.billing_method) parts.push(String(price.billing_method));
	if (typeof price.amount === "number") {
		const units =
			typeof price.billing_units === "number" && price.billing_units > 1
				? `/${price.billing_units}`
				: "";
		parts.push(`price=${price.amount}${units}`);
	}
	if (Array.isArray(price.tiers) && price.tiers.length) {
		parts.push(`tiers=${price.tiers.length}`);
	}
	// remove_items filters on the price interval, falling back to the reset one.
	const interval = compactInterval(price) ?? compactInterval(record.reset);
	if (interval) parts.push(interval);
	if (record.rollover) parts.push("rollover");
	return parts.join(" ");
};

/** The 30KB pretty-printed listPlans/listFeatures dump is ~89% whitespace and
 * display noise; the agent answers trivial catalog questions from this compact
 * index and calls getPlan only for detail beyond it. */
export const compactPlans = (plans: unknown) =>
	listOf(plans).map((plan) => ({
		...(plan.add_on === true ? { add_on: true } : {}),
		id: plan.id,
		...(Array.isArray(plan.items) && plan.items.length
			? {
					items: plan.items
						.map(compactItem)
						.filter((item): item is string => Boolean(item)),
				}
			: {}),
		name: plan.name,
		...(compactPrice(plan.price) ? { price: compactPrice(plan.price) } : {}),
	}));

export const compactFeatures = (features: unknown) =>
	listOf(features).map((feature) => ({
		id: feature.id,
		name: feature.name,
		...(feature.type ? { type: feature.type } : {}),
	}));
