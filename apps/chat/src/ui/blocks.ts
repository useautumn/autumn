import type { AppEnv } from "@autumn/shared";
import { Actions, Button, Card, CardText, Divider, Field, Fields } from "chat";
import { toolLabel } from "../agent/toolPolicy.js";

const formatPreview = (preview: unknown) =>
	typeof preview === "string"
		? preview
		: "";

const getRequest = (args?: Record<string, unknown>) =>
	(args?.request && typeof args.request === "object"
		? args.request
		: args) as Record<string, unknown> | undefined;

const getFieldValue = (value: unknown) =>
	typeof value === "string" || typeof value === "number" ? String(value) : null;

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const formatPrice = (request: Record<string, unknown>) => {
	const customize = getRecord(request.customize);
	const price = getRecord(customize.price);
	const amount = getFieldValue(price.amount);
	const interval = getFieldValue(price.interval);
	return amount ? `$${amount}${interval ? `/${interval}` : ""}` : null;
};

const envLabel = (env?: AppEnv) =>
	env === "live" ? "Live" : env === "sandbox" ? "Sandbox" : null;

const requestFields = ({
	env,
	toolName,
	toolArgs,
}: {
	env?: AppEnv;
	toolName: string;
	toolArgs?: Record<string, unknown>;
}) => {
	const request = getRequest(toolArgs);
	const environment = envLabel(env);
	const baseFields = [
		Field({
			label: "Action",
			value: toolLabel(toolName),
		}),
		...(environment
			? [Field({ label: "Environment", value: environment })]
			: []),
	];
	if (!request) return baseFields;

	return [
		...baseFields,
		...[
			["Customer", request.customer_id],
			["Plan", request.plan_id],
			["Entity", request.entity_id],
			["Subscription", request.subscription_id],
			["Price", formatPrice(request)],
			["Invoice mode", request.invoice_mode],
			["Proration", request.proration_behavior],
			["Redirect", request.redirect_mode],
		].flatMap(([label, value]) => {
			const fieldValue = getFieldValue(value);
			return fieldValue ? [Field({ label: String(label), value: fieldValue })] : [];
		}),
	].slice(0, 8);
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
				!/^(i('|’)ll|let me|here('|’)s|would you like|shall i|tool:|[\{\}\"])/i.test(
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
	const nested = resultBody.message || resultBody.status ? resultBody : getRecord(body.data);
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
}) =>
	{
		const fields = requestFields({ env, toolName, toolArgs });
		const lines = preview ? previewLines(preview) : [];

		return Card({
			title: `${toolLabel(toolName)}?`,
			subtitle: "Review the preview before this runs",
			children: [
				...(fields.length ? [Fields(fields)] : []),
				...(lines.length
					? [Divider(), CardText(lines.map((line) => `• ${line}`).join("\n"))]
					: []),
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
	const fields = requestFields({ env, toolName, toolArgs });
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
		subtitle:
			status === "running"
				? "Applying the approved action"
				: "The approval is closed",
		children: [
			...(fields.length ? [Fields(fields)] : []),
			...(lines.length
				? [
						Divider(),
						CardText(lines.map((line) => `• ${cleanPreviewLine(line)}`).join("\n")),
					]
				: []),
		],
	});
};
