import type { AutumnApiCall } from "../context/types.js";
import type { EvalToolCall } from "../drivers/types.js";
import type { EvalTraceEvent } from "./types.js";

const truncate = ({ text, max = 160 }: { text: string; max?: number }) =>
	text.length > max ? `${text.slice(0, max - 3)}...` : text;

const bodyOf = (value: Record<string, unknown>) =>
	value.request && typeof value.request === "object"
		? (value.request as Record<string, unknown>)
		: value;

const billingToolNames = new Set([
	"attach",
	"createSchedule",
	"previewAttach",
	"previewCreateSchedule",
]);

const monthNames = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const looksLikeEpochMsField = (key: string, value: number) =>
	(value >= 946_684_800_000 &&
		value <= 4_102_444_800_000 &&
		(key.endsWith("_at") ||
			key.endsWith("_time") ||
			key === "timestamp" ||
			key === "date")) ||
	false;

const formatEpochMs = (value: number) => {
	const date = new Date(value);
	const day = date.getUTCDate();
	const month = monthNames[date.getUTCMonth()];
	const year = date.getUTCFullYear();
	const hour = String(date.getUTCHours()).padStart(2, "0");
	const minute = String(date.getUTCMinutes()).padStart(2, "0");
	return `${day} ${month} ${year} ${hour}:${minute} UTC (${value})`;
};

const humanizeEpochMs = (value: unknown, key = ""): unknown => {
	if (typeof value === "number" && looksLikeEpochMsField(key, value)) {
		return formatEpochMs(value);
	}
	if (Array.isArray(value)) {
		return value.map((item) => humanizeEpochMs(item));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				humanizeEpochMs(entryValue, entryKey),
			]),
		);
	}
	return value;
};

const formatJsonBody = ({
	body,
	label,
}: {
	body: Record<string, unknown>;
	label: string;
}) => {
	const json = JSON.stringify(humanizeEpochMs(body), null, 2);
	return json ? `\n[${label}]\n${json}` : "";
};

const compactFields = (body: Record<string, unknown>) =>
	[
		["customer", body.customer_id],
		["plan", body.plan_id],
		["entity", body.entity_id],
		["feature", body.feature_id],
		["email", body.email],
		["search", body.search],
		[
			"invoice_mode",
			typeof body.invoice_mode === "object" && body.invoice_mode !== null
				? "true"
				: undefined,
		],
	]
		.flatMap(([key, value]) =>
			typeof value === "string" && value ? [`${key}=${value}`] : [],
		)
		.join(" ");

const formatToolCall = (call: EvalToolCall) => {
	const body = bodyOf(call.args);
	const fields = compactFields(body);
	const details = billingToolNames.has(call.name)
		? formatJsonBody({ body, label: "tool:body" })
		: "";
	return `[tool] ${call.name}${fields ? ` ${fields}` : ""}${details}`;
};

const formatApiCall = (call: AutumnApiCall) => {
	const fields = compactFields(call.body);
	const details = call.endpoint.startsWith("/v1/billing.")
		? formatJsonBody({ body: call.body, label: "api:body" })
		: "";
	return `[api] POST ${call.endpoint}${fields ? ` ${fields}` : ""}${details}`;
};

const summarizeRecord = (record: Record<string, unknown>) =>
	[
		["id", record.id],
		["name", record.name],
		[
			"subscriptions",
			Array.isArray(record.subscriptions)
				? record.subscriptions.length
				: undefined,
		],
		["plan_id", record.plan_id],
	]
		.flatMap(([key, value]) =>
			typeof value === "string" || typeof value === "number"
				? [`${key}=${value}`]
				: [],
		)
		.join(" ");

const formatApiResponse = ({
	endpoint,
	response,
}: {
	endpoint: string;
	response: unknown;
}) => {
	if (!response || typeof response !== "object") {
		return `[api:response] ${endpoint} ${String(response)}`;
	}

	const record = response as Record<string, unknown>;
	if (Array.isArray(record.list)) {
		const first = record.list[0];
		const firstSummary =
			first && typeof first === "object"
				? summarizeRecord(first as Record<string, unknown>)
				: "";
		return `[api:response] ${endpoint} list=${record.list.length}${firstSummary ? ` first(${firstSummary})` : ""}`;
	}

	const summary = summarizeRecord(record);
	return `[api:response] ${endpoint}${summary ? ` ${summary}` : ""}`;
};

export const formatTraceEvent = (event: EvalTraceEvent): string | null => {
	switch (event.type) {
		case "agent_text":
			return event.text ? `[agent] ${truncate({ text: event.text })}` : null;
		case "api_call":
			return formatApiCall(event.call);
		case "api_response":
			return formatApiResponse(event);
		case "approval_approved":
			return "[approval] approved pending tool call";
		case "approval_pending":
			return "[approval] pending";
		case "eval_finished":
			return "[eval] finished";
		case "eval_started":
			return `[eval] ${event.name ?? "started"}`;
		case "tool_call":
			return formatToolCall(event.call);
		case "user_turn":
			return `[user] ${truncate({ text: event.message })}`;
	}
};
