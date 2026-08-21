import type { ApprovalDetailStepLink } from "@autumn/shared";

export type StepResultSummary = {
	links: ApprovalDetailStepLink[];
	message: string | null;
	requiredAction: { code: string | null; reason: string | null } | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asString = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value : null;

const contentText = (value: unknown): string | null => {
	const content = asRecord(value).content;
	if (!Array.isArray(content)) return null;
	const item = content.find(
		(entry) => typeof asRecord(entry).text === "string",
	);
	return item ? (asRecord(item).text as string) : null;
};

const parsedBody = (value: unknown): Record<string, unknown> => {
	if (typeof value === "string") {
		try {
			return asRecord(JSON.parse(value));
		} catch {
			return {};
		}
	}
	const text = contentText(value);
	if (text) return parsedBody(text);
	return asRecord(value);
};

/** Whitelist extraction only: raw step results are full API responses
 * (customer data, invoices) and must never ship to the dashboard wholesale. */
export const summarizeStepResult = (
	result: unknown,
): StepResultSummary | null => {
	if (result === null || result === undefined) return null;
	const body = parsedBody(result);
	const nested = parsedBody(body.result ?? body.data);
	const value = (key: string) => body[key] ?? nested[key];
	const invoice = asRecord(body.invoice ?? nested.invoice);
	const requiredAction = asRecord(value("required_action"));

	const links: ApprovalDetailStepLink[] = [];
	const invoiceUrl = asString(invoice.hosted_invoice_url);
	if (invoiceUrl) links.push({ label: "View invoice", url: invoiceUrl });
	const paymentUrl = asString(value("payment_url"));
	if (paymentUrl) links.push({ label: "Complete payment", url: paymentUrl });
	const checkoutUrl = asString(value("checkout_url"));
	if (checkoutUrl) links.push({ label: "Open checkout", url: checkoutUrl });

	const code = asString(requiredAction.code);
	const reason = asString(requiredAction.reason);
	return {
		links,
		message: asString(value("message")),
		requiredAction: code || reason ? { code, reason } : null,
	};
};
