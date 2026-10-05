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

// attach / createSchedule / setPlans / updateSubscription previews all share the
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

const amountRows = ({
	currency,
	lines,
}: {
	currency: string;
	lines: ReadonlyArray<{ amount: number; name: string }>;
}) => {
	const rows = lines
		.slice(0, MAX_LINE_ITEM_ROWS)
		.map((line) => [line.name, formatMoney({ amount: line.amount, currency })]);
	if (lines.length > MAX_LINE_ITEM_ROWS) {
		rows.push([`+${lines.length - MAX_LINE_ITEM_ROWS} more items`, ""]);
	}
	return rows;
};

const isInvoicePreview = (payload: LooseRecord) =>
	Array.isArray(payload.lines) &&
	typeof payload.total === "number" &&
	typeof payload.amount_due === "number";

// invoices.create / invoices.reissue previews: the invoice that will be issued.
const invoicePreviewElements = (payload: LooseRecord): CardChild[] => {
	const currency =
		typeof payload.currency === "string" ? payload.currency : "usd";
	// Lines at their pre-discount amount: discounts get their own row, so the
	// rows add up to the total.
	const lines = (payload.lines as unknown[]).flatMap((line) => {
		const record = asRecord(line);
		return typeof record?.description === "string" &&
			typeof record.amount === "number"
			? [{ amount: record.amount, name: record.description }]
			: [];
	});
	const rows = amountRows({ currency, lines });
	const discountTotal = payload.discount_total;
	if (typeof discountTotal === "number" && discountTotal > 0) {
		rows.push([
			"Discounts",
			`-${formatMoney({ amount: discountTotal, currency })}`,
		]);
	}
	const taxTotal = asRecord(payload.tax)?.total;
	if (typeof taxTotal === "number" && taxTotal !== 0) {
		rows.push(["Tax", formatMoney({ amount: taxTotal, currency })]);
	}
	rows.push([
		"Total",
		formatMoney({ amount: payload.total as number, currency }),
	]);
	if (payload.amount_due !== payload.total) {
		rows.push([
			"Amount due after credit",
			formatMoney({ amount: payload.amount_due as number, currency }),
		]);
	}

	const dueNote =
		typeof payload.due_date === "number"
			? `Due ${formatEpochDate(payload.due_date)}`
			: "Charged to the customer's payment method when issued";
	return [
		Table({ align: ["left", "right"], headers: ["Item", "Amount"], rows }),
		CardText(dueNote, { style: "muted" }),
	];
};

const isInvoiceRecord = (payload: LooseRecord) =>
	typeof payload.stripe_id === "string" &&
	typeof payload.status === "string" &&
	typeof payload.total === "number" &&
	!("lines" in payload);

// An existing invoice (getInvoice), shown on void / pay / finalize cards.
const invoiceRecordElements = (payload: LooseRecord): CardChild[] => {
	const currency =
		typeof payload.currency === "string" ? payload.currency : "usd";
	const items = Array.isArray(payload.items) ? payload.items : [];
	const lines = items.flatMap((item) => {
		const record = asRecord(item);
		return typeof record?.description === "string" &&
			typeof record.amount === "number"
			? [{ amount: record.amount, name: record.description }]
			: [];
	});
	const rows = amountRows({ currency, lines });
	rows.push([
		"Total",
		formatMoney({ amount: payload.total as number, currency }),
	]);
	if (typeof payload.amount_paid === "number" && payload.amount_paid > 0) {
		rows.push(["Paid", formatMoney({ amount: payload.amount_paid, currency })]);
	}

	const notes = [
		`Status: ${payload.status}`,
		typeof payload.customer_id === "string"
			? `Customer: ${payload.customer_id}`
			: null,
		typeof payload.created_at === "number"
			? `Created ${formatEpochDate(payload.created_at)}`
			: null,
		`Stripe: ${payload.stripe_id}`,
	].filter((note): note is string => Boolean(note));
	return [
		Table({ align: ["left", "right"], headers: ["Item", "Amount"], rows }),
		CardText(notes.join("  ·  "), { style: "muted" }),
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
	if (isInvoicePreview(payload)) return invoicePreviewElements(payload);
	if (isInvoiceRecord(payload)) return invoiceRecordElements(payload);
	return null;
};
