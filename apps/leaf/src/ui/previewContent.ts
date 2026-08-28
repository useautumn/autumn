import { formatMoney, parsePreviewPayload } from "@autumn/render";
import type { CardChild } from "chat";
import { CardText, Table } from "chat";
import { format } from "date-fns";

type LooseRecord = Record<string, unknown>;

const MAX_LINE_ITEM_ROWS = 10;

const asRecord = (value: unknown): LooseRecord | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as LooseRecord)
		: null;

export const formatEpochDate = (epochMs: number) =>
	format(epochMs, "MMM d, yyyy");

const UPDATE_INTENT_LABELS: Record<string, string> = {
	cancel_end_of_cycle: "Cancel at end of cycle",
	cancel_immediately: "Cancel immediately",
	uncancel: "Uncancel",
	update_plan: "Update plan",
	update_quantity: "Update quantity",
};

const lineItemRows = ({
	lineItems,
	currency,
}: {
	lineItems: unknown[];
	currency: string;
}) => {
	const items = lineItems.flatMap((item) => {
		const record = asRecord(item);
		return typeof record?.display_name === "string" &&
			typeof record.total === "number"
			? [{ name: record.display_name, total: record.total }]
			: [];
	});

	const rows = items
		.slice(0, MAX_LINE_ITEM_ROWS)
		.map((item) => [item.name, formatMoney({ amount: item.total, currency })]);
	if (items.length > MAX_LINE_ITEM_ROWS) {
		rows.push([`+${items.length - MAX_LINE_ITEM_ROWS} more items`, ""]);
	}
	return rows;
};

// attach / createSchedule / updateSubscription previews all share the
// BillingPreviewResponse shape (line_items, total, currency, next_cycle).
// Rendered receipt-style: one table holding line items AND total rows.
const billingPreviewElements = (payload: LooseRecord): CardChild[] => {
	const currency =
		typeof payload.currency === "string" ? payload.currency : "usd";
	const rows = lineItemRows({
		lineItems: payload.line_items as unknown[],
		currency,
	});

	const nextCycle = asRecord(payload.next_cycle);
	const intentLabel =
		typeof payload.intent === "string"
			? UPDATE_INTENT_LABELS[payload.intent]
			: undefined;

	rows.push([
		"Due now",
		formatMoney({ amount: payload.total as number, currency }),
	]);
	if (
		typeof nextCycle?.total === "number" &&
		typeof nextCycle.starts_at === "number"
	) {
		rows.push([
			`Next cycle · ${formatEpochDate(nextCycle.starts_at)}`,
			formatMoney({ amount: nextCycle.total, currency }),
		]);
	}

	const notes = [
		intentLabel ? `Change: ${intentLabel}` : null,
		payload.redirect_to_checkout === true
			? "Customer pays via checkout link"
			: null,
	].filter((note): note is string => Boolean(note));

	return [
		Table({ align: ["left", "right"], headers: ["Item", "Amount"], rows }),
		...(notes.length
			? [CardText(notes.join("  ·  "), { style: "muted" })]
			: []),
	];
};

const balancePreviewElements = (payload: LooseRecord): CardChild[] | null => {
	const request = asRecord(payload.request);
	if (!request) return null;

	const reset = asRecord(request.reset);
	const fields = [
		["Feature", request.feature_id],
		[
			"Grant",
			request.unlimited === true ? "Unlimited" : request.included_grant,
		],
		[
			"Expires",
			typeof request.expires_at === "number"
				? formatEpochDate(request.expires_at)
				: null,
		],
		[
			"Resets",
			typeof reset?.interval === "string"
				? `Every ${typeof reset.interval_count === "number" && reset.interval_count > 1 ? `${reset.interval_count} ${reset.interval}s` : reset.interval}`
				: null,
		],
	].flatMap(([label, value]) =>
		typeof value === "string" || typeof value === "number"
			? [[String(label), String(value)]]
			: [],
	);

	return fields.length
		? [
				Table({
					align: ["left", "right"],
					headers: ["Item", "Value"],
					rows: fields,
				}),
			]
		: null;
};

/** Structured card body for a preview payload, or null to fall back to text. */
export const previewElements = (preview: unknown): CardChild[] | null => {
	const payload = parsePreviewPayload(preview);
	if (!payload) return null;
	if (Array.isArray(payload.line_items) && typeof payload.total === "number") {
		return billingPreviewElements(payload);
	}
	if (payload.action === "createBalance") {
		return balancePreviewElements(payload);
	}
	return null;
};
