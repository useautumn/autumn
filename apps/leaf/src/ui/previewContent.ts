import type { CardChild } from "chat";
import { CardText, Table } from "chat";
import { format } from "date-fns";

type LooseRecord = Record<string, unknown>;

const MAX_LINE_ITEM_ROWS = 10;

const asRecord = (value: unknown): LooseRecord | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as LooseRecord)
		: null;

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

export const formatEpochDate = (epochMs: number) =>
	format(epochMs, "MMM d, yyyy");

// Amounts are major currency units (the schema's "in cents" wording is stale —
// the dashboard renders these values directly).
const formatMoney = (amount: number, currency: string) => {
	try {
		return new Intl.NumberFormat("en-US", {
			currency: currency.toUpperCase(),
			currencyDisplay: "narrowSymbol",
			style: "currency",
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
};

// Unwraps MCP transport shapes around the preview payload: JSON strings,
// [{text}] content arrays, {content} results, and the {preview, pending} wrapper.
export const parsePreviewPayload = (preview: unknown): LooseRecord | null => {
	if (typeof preview === "string") {
		const parsed = parseJson(preview.trim());
		return parsed ? parsePreviewPayload(parsed) : null;
	}
	if (Array.isArray(preview)) {
		for (const entry of preview) {
			const record = asRecord(entry);
			if (typeof record?.text !== "string") continue;
			const parsed = parsePreviewPayload(record.text);
			if (parsed) return parsed;
		}
		return null;
	}
	const record = asRecord(preview);
	if (!record) return null;
	if (Array.isArray(record.content)) return parsePreviewPayload(record.content);
	if ("preview" in record) return parsePreviewPayload(record.preview);
	return record;
};

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
		.map((item) => [item.name, formatMoney(item.total, currency)]);
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

	rows.push(["Due now", formatMoney(payload.total as number, currency)]);
	if (
		typeof nextCycle?.total === "number" &&
		typeof nextCycle.starts_at === "number"
	) {
		rows.push([
			`Next cycle · ${formatEpochDate(nextCycle.starts_at)}`,
			formatMoney(nextCycle.total, currency),
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
			? [`**${label}**  ${value}`]
			: [],
	);

	return [
		...(fields.length ? [CardText(fields.join("\n"))] : []),
		...(typeof payload.impact === "string"
			? [CardText(payload.impact, { style: "muted" })]
			: []),
	];
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
