import type { AppEnv } from "@autumn/shared";
import { Actions, Button, Card, CardText, Divider } from "chat";
import { toolLabel } from "../agent/tools/toolPolicy.js";
import { formatEpochDate, previewElements } from "./previewContent.js";

const formatPreview = (preview: unknown) =>
	typeof preview === "string" ? preview : "";

const getRequest = (args?: Record<string, unknown>) =>
	(args?.request && typeof args.request === "object" ? args.request : args) as
		| Record<string, unknown>
		| undefined;

const getFieldValue = (value: unknown) =>
	typeof value === "string" || typeof value === "number"
		? String(value)
		: typeof value === "boolean"
			? value
				? "Yes"
				: "No"
			: null;

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const formatPrice = (request: Record<string, unknown>) => {
	const customize = getRecord(request.customize);
	const price = getRecord(customize.price);
	const amount = getFieldValue(price.amount);
	const interval = getFieldValue(price.interval);
	return amount ? `$${amount}${interval ? `/${interval}` : ""}` : null;
};

const formatInvoiceMode = (value: unknown) => {
	if (typeof value === "boolean") return value ? "enabled" : "disabled";
	const invoiceMode = getRecord(value);
	if (!Object.keys(invoiceMode).length) return null;

	return [
		invoiceMode.enabled === true
			? "enabled"
			: invoiceMode.enabled === false
				? "disabled"
				: null,
		invoiceMode.finalize === false
			? "draft invoice"
			: invoiceMode.finalize === true
				? "finalize invoice"
				: null,
		invoiceMode.enable_plan_immediately === true
			? "enable immediately"
			: invoiceMode.enable_plan_immediately === false
				? "access waits"
				: null,
	]
		.filter((part): part is string => Boolean(part))
		.join(", ");
};

const envLabel = (env?: AppEnv) =>
	env === "live" ? "Live" : env === "sandbox" ? "Sandbox" : null;

const cardSubtitle = ({ env, hint }: { env?: AppEnv; hint: string }) =>
	[envLabel(env), hint].filter(Boolean).join("  ·  ");

// One "**Label**  value" line per pair — half the height of stacked fields.
const requestSummary = (toolArgs?: Record<string, unknown>) => {
	const request = getRequest(toolArgs);
	if (!request) return null;

	const lines = [
		["Customer", request.customer_id],
		["Plan", request.plan_id],
		["Feature", request.feature_id],
		["Entity", request.entity_id],
		["Subscription", request.subscription_id],
		[
			"Starts",
			typeof request.starts_at === "number"
				? formatEpochDate(request.starts_at)
				: null,
		],
		["Price", formatPrice(request)],
	]
		.flatMap(([label, value]) => {
			const fieldValue = getFieldValue(value);
			return fieldValue ? [`**${label}**  ${fieldValue}`] : [];
		})
		.slice(0, 8);
	return lines.length ? lines.join("\n") : null;
};

// Technical knobs the reviewer rarely acts on — shown as one muted line, not fields.
const configSummary = (toolArgs?: Record<string, unknown>) => {
	const request = getRequest(toolArgs);
	if (!request) return null;

	const summary = [
		["Invoice", formatInvoiceMode(request.invoice_mode)],
		["Enable immediately", getFieldValue(request.enable_plan_immediately)],
		["Proration", getFieldValue(request.proration_behavior)],
		["Redirect", getFieldValue(request.redirect_mode)],
	]
		.flatMap(([label, value]) => (value ? [`${label}: ${value}`] : []))
		.join("  ·  ");
	return summary.length ? summary : null;
};

const cleanPreviewLine = (line: string) =>
	line
		.replace(/^[-*•]\s*/, "")
		.replace(/\*\*/g, "")
		.replace(/__+/g, "")
		.trim();

const previewLines = (preview: unknown) =>
	formatPreview(preview)
		.replace(
			/\s*(Plan:|Customer:|Description|Amount|Total|Discounts?:|Payment will|No discounts|No existing)/g,
			"\n$1",
		)
		.split(/\n+/)
		.map(cleanPreviewLine)
		.filter(Boolean)
		.filter(
			(line) =>
				!/^(i('|’)ll|let me|here('|’)s|would you like|shall i|tool:|[{}"])/i.test(
					line,
				),
		)
		.slice(0, 8);

const resultLines = (result: unknown) => {
	if (!result) return [];
	if (typeof result === "string") return [result];
	if (typeof result !== "object") return [String(result)];

	const body = result as Record<string, unknown>;
	const resultBody = getRecord(body.result);
	const nested =
		resultBody.message || resultBody.status ? resultBody : getRecord(body.data);
	const value = (key: string) => body[key] ?? nested[key];
	const message = value("message");
	const status = value("status");
	const id = value("id");
	const url = value("url");
	const checkoutUrl = value("checkout_url");

	return [
		typeof message === "string" ? message : null,
		typeof status === "string" ? `Status: ${status}` : null,
		typeof id === "string" ? `ID: ${id}` : null,
		typeof url === "string" ? `URL: ${url}` : null,
		typeof checkoutUrl === "string" ? `Checkout URL: ${checkoutUrl}` : null,
	]
		.filter((line): line is string => Boolean(line))
		.slice(0, 6);
};

const statusLines = ({
	status,
	result,
}: {
	status: "approved" | "cancelled" | "failed" | "running";
	result?: unknown;
}) => {
	const lines = resultLines(result);
	if (lines.length) return lines;
	if (status === "running") return ["Applying the approved action now..."];
	if (status === "cancelled") return ["No changes were made."];
	return status === "failed" ? ["The action failed."] : [];
};

export const approvalCard = ({
	env,
	id,
	toolName,
	toolArgs,
	preview,
}: {
	env?: AppEnv;
	id: string;
	toolName: string;
	toolArgs?: Record<string, unknown>;
	preview?: unknown;
}) => {
	const summary = requestSummary(toolArgs);
	const config = configSummary(toolArgs);
	const structured = preview ? previewElements(preview) : null;
	const lines = !structured && preview ? previewLines(preview) : [];

	return Card({
		title: `${toolLabel(toolName)}?`,
		subtitle: cardSubtitle({
			env,
			hint: "Review the preview before this runs",
		}),
		children: [
			...(summary ? [CardText(summary)] : []),
			...(structured ?? []),
			...(lines.length
				? [CardText(lines.map((line) => `• ${line}`).join("\n"))]
				: []),
			...(config ? [CardText(config, { style: "muted" })] : []),
			Divider(),
			Actions([
				Button({
					id: "approve_billing_action",
					label: "Approve",
					style: "primary",
					value: id,
				}),
				Button({
					id: "cancel_billing_action",
					label: "Cancel",
					style: "danger",
					value: id,
				}),
			]),
		],
	});
};

export const approvalStatusCard = ({
	env,
	status,
	toolName,
	toolArgs,
	preview,
	result,
}: {
	env?: AppEnv;
	status: "approved" | "cancelled" | "failed" | "running";
	toolName: string;
	toolArgs?: Record<string, unknown>;
	preview?: unknown;
	result?: unknown;
}) => {
	const summary = requestSummary(toolArgs);
	const config = configSummary(toolArgs);
	const lines = statusLines({ status, result });
	const title =
		status === "approved"
			? `${toolLabel(toolName)} approved`
			: status === "cancelled"
				? `${toolLabel(toolName)} cancelled`
				: status === "running"
					? `Running ${toolLabel(toolName)}`
					: `${toolLabel(toolName)} failed`;

	return Card({
		title,
		subtitle: cardSubtitle({
			env,
			hint:
				status === "running"
					? "Applying the approved action"
					: "The approval is closed",
		}),
		children: [
			...(summary ? [CardText(summary)] : []),
			...(lines.length
				? [
						CardText(
							lines.map((line) => `• ${cleanPreviewLine(line)}`).join("\n"),
						),
					]
				: []),
			...(config ? [CardText(config, { style: "muted" })] : []),
		],
	});
};
