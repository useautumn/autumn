import type { AppEnv } from "@autumn/shared";
import {
	Actions,
	Button,
	Card,
	type CardChild,
	CardText,
	Divider,
	Field,
	type FieldElement,
	Fields,
	LinkButton,
	Modal,
} from "chat";
import { normalizeToolName, toolLabel } from "../agent/tools/toolPolicy.js";

export type ApprovalCardStatus =
	| "approved"
	| "cancelled"
	| "expired"
	| "failed"
	| "running"
	| "superseded";

const getRequest = (args?: Record<string, unknown>) =>
	(args?.request && typeof args.request === "object" ? args.request : args) as
		| Record<string, unknown>
		| undefined;

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const getString = (value: unknown) =>
	typeof value === "string" && value.trim() ? value.trim() : null;

const getNumber = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const parseJsonRecord = (value: string) => {
	try {
		return getRecord(JSON.parse(value));
	} catch {
		return {};
	}
};

const getContentText = (value: unknown) => {
	const body = getRecord(value);
	const content = Array.isArray(value)
		? value
		: Array.isArray(body.content)
			? body.content
			: [];
	const item = content.find((entry): entry is { text: string } =>
		Boolean(
			entry &&
				typeof entry === "object" &&
				"text" in entry &&
				typeof entry.text === "string",
		),
	);
	return item?.text ?? null;
};

const getResultBody = (value: unknown): Record<string, unknown> => {
	if (typeof value === "string") return parseJsonRecord(value);
	const contentText = getContentText(value);
	if (contentText) return parseJsonRecord(contentText);
	return getRecord(value);
};

const capitalize = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1);

const bold = (value: string) => `**${value}**`;

const mention = (userId?: string) => (userId ? `<@${userId}>` : null);

const autumnDashboardBase = () =>
	process.env.AUTUMN_DASHBOARD_URL ?? "https://app.useautumn.com";

const autumnCustomerLink = ({
	customerId,
	env,
}: {
	customerId: string | null;
	env?: AppEnv;
}) => {
	if (!customerId || !env) return null;
	const envPath = env === "live" ? "" : "/sandbox";
	return `${autumnDashboardBase()}${envPath}/customers/${customerId}`;
};

const contextLine = (parts: Array<string | null | undefined>) =>
	parts.filter(Boolean).join(" · ");

const formatMoney = ({
	amount,
	currency,
}: {
	amount: number;
	currency?: string;
}) => {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: (currency ?? "usd").toUpperCase(),
		}).format(amount);
	} catch {
		return `$${amount}`;
	}
};

const formatDay = (epochMs: number) =>
	new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeZone: "UTC",
	}).format(new Date(epochMs));

const envLine = (env?: AppEnv) =>
	env === "live"
		? "🔴 Live — real billing"
		: env === "sandbox"
			? "🧪 Sandbox"
			: null;

type ActionPhrases = {
	done: string;
	failed: string;
	pending: string;
	running: string;
};

// Tier 1 of the card hierarchy: customer and plan are the subject of the
// action, so they render as a sentence — never as label/value fields.
const actionPhrases = ({
	env,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): ActionPhrases => {
	const request = getRequest(toolArgs) ?? {};
	const customer = getString(request.customer_id);
	const plan = getString(request.plan_id);
	const entity = getString(request.entity_id);
	const customerUrl = autumnCustomerLink({ customerId: customer, env });
	const customerLabel = customer
		? bold(customerUrl ? `<${customerUrl}|${customer}>` : customer)
		: "the customer";
	const planLabel = plan ? bold(plan) : "the plan";
	const entitySuffix = entity ? ` (entity ${bold(entity)})` : "";

	switch (normalizeToolName(toolName)) {
		case "attach": {
			const target = `${planLabel} to ${customerLabel}${entitySuffix}`;
			return {
				done: `Attached ${target}`,
				failed: `Couldn't attach ${target}`,
				pending: `Attach ${target}`,
				running: `Attaching ${target}`,
			};
		}
		case "updateSubscription": {
			const target = `${customerLabel}'s subscription${
				plan ? ` to ${planLabel}` : ""
			}${entitySuffix}`;
			return {
				done: `Updated ${target}`,
				failed: `Couldn't update ${target}`,
				pending: `Update ${target}`,
				running: `Updating ${target}`,
			};
		}
		case "createSchedule": {
			const target = `plan changes for ${customerLabel}${entitySuffix}`;
			return {
				done: `Scheduled ${target}`,
				failed: `Couldn't schedule ${target}`,
				pending: `Schedule ${target}`,
				running: `Scheduling ${target}`,
			};
		}
		case "createBalance": {
			const feature = getString(request.feature_id);
			const target = `${
				feature ? `a ${bold(feature)} balance` : "a balance"
			} for ${customerLabel}${entitySuffix}`;
			return {
				done: `Created ${target}`,
				failed: `Couldn't create ${target}`,
				pending: `Create ${target}`,
				running: `Creating ${target}`,
			};
		}
		default: {
			const label = toolLabel(toolName);
			const forCustomer = customer ? ` for ${customerLabel}` : "";
			return {
				done: `${label} completed${forCustomer}`,
				failed: `${label} failed${forCustomer}`,
				pending: `${label}${forCustomer}`,
				running: `Running ${label.toLowerCase()}${forCustomer}`,
			};
		}
	}
};

// The preview tool returns { preview: BillingPreviewResponse, ... } wrapped in
// MCP content blocks; unwrap both layers before reading money facts.
const getPreviewBody = (preview: unknown) => {
	const body = getResultBody(preview);
	const inner = getRecord(body.preview);
	return Object.keys(inner).length ? inner : body;
};

const moneyFields = ({
	preview,
	toolArgs,
}: {
	preview?: unknown;
	toolArgs?: Record<string, unknown>;
}) => {
	const fields: FieldElement[] = [];
	const previewBody = getPreviewBody(preview);
	const currency = getString(previewBody.currency) ?? undefined;
	const total = getNumber(previewBody.total);
	if (total !== null) {
		// Downgrades produce a negative total — that's money back, not money due.
		fields.push(
			total < 0
				? Field({
						label: "Credit today",
						value: formatMoney({ amount: Math.abs(total), currency }),
					})
				: Field({
						label: "Due today",
						value: formatMoney({ amount: total, currency }),
					}),
		);
	}
	const refundAmount = getNumber(getRecord(previewBody.refund).amount);
	if (refundAmount !== null) {
		fields.push(
			Field({
				label: "Refund",
				value: formatMoney({ amount: refundAmount, currency }),
			}),
		);
	}

	const request = getRequest(toolArgs) ?? {};
	const price = getRecord(getRecord(request.customize).price);
	const priceAmount = getNumber(price.amount);
	if (priceAmount !== null) {
		const interval = getString(price.interval);
		fields.push(
			Field({
				label: "Custom price",
				value: `${formatMoney({
					amount: priceAmount,
					currency: getString(price.currency) ?? undefined,
				})}${interval ? `/${interval}` : ""}`,
			}),
		);
	}
	return fields.slice(0, 4);
};

const formatNumber = (value: number) =>
	new Intl.NumberFormat("en-US").format(value);

const billingMethodLabel = (value: unknown) =>
	value === "prepaid"
		? "prepaid"
		: value === "usage_based"
			? "usage-based"
			: null;

const intervalAdverbs: Record<string, string> = {
	day: "daily",
	week: "weekly",
	month: "monthly",
	quarter: "quarterly",
	semi_annual: "semi-annually",
	year: "yearly",
};

const intervalLabel = (value: unknown) => {
	const interval = getString(value);
	return interval ? (intervalAdverbs[interval] ?? interval) : null;
};

// One added item (CreatePlanItem): feature in bold, then a concise descriptor
// of allowance/price/cadence so reviewers see what the customization grants.
const addedItemLine = (item: Record<string, unknown>) => {
	const feature = getString(item.feature_id) ?? "feature";
	const parts: string[] = [];
	if (item.unlimited === true) {
		parts.push("unlimited");
	} else {
		const price = getRecord(item.price);
		const included = getNumber(item.included);
		const amount = getNumber(price.amount);
		const hasTiers = Array.isArray(price.tiers) && price.tiers.length > 0;
		const allowance =
			included !== null ? `${formatNumber(included)} included` : null;
		const units = getNumber(price.billing_units);
		const priceLabel =
			amount !== null
				? units && units > 1
					? `${formatMoney({ amount })} per ${formatNumber(units)}`
					: `${formatMoney({ amount })} each`
				: hasTiers
					? "tiered pricing"
					: null;
		if (allowance && priceLabel) {
			parts.push(`${allowance}, then ${priceLabel}`);
		} else if (allowance ?? priceLabel) {
			parts.push((allowance ?? priceLabel) as string);
		}
		const method = billingMethodLabel(price.billing_method);
		if (method) parts.push(method);
		const interval = intervalLabel(
			price.interval ?? getRecord(item.reset).interval,
		);
		if (interval) parts.push(interval);
	}
	const detail = parts.join(" · ");
	return `• ${bold(feature)}${detail ? ` — ${detail}` : ""}`;
};

// One removed item (PlanItemFilter): describe by feature, falling back to the
// billing-method / interval qualifiers when the filter is feature-agnostic.
const removedItemLine = (filter: Record<string, unknown>) => {
	const feature = getString(filter.feature_id);
	const qualifiers = [
		billingMethodLabel(filter.billing_method),
		intervalLabel(filter.interval),
	].filter((part): part is string => Boolean(part));
	if (feature) {
		return `• ${bold(feature)}${
			qualifiers.length ? ` · ${qualifiers.join(" · ")}` : ""
		}`;
	}
	return `• ${qualifiers.length ? qualifiers.join(" · ") : "matching items"}`;
};

const ITEM_LINES_MAX = 8;

// Tier 4: PATCH-style plan customizations, set off by a divider so the added /
// removed groups read as a distinct "what changes" block under the money facts.
const itemChangeBlocks = (toolArgs?: Record<string, unknown>): CardChild[] => {
	const customize = getRecord(getRequest(toolArgs)?.customize);
	const addItems = Array.isArray(customize.add_items)
		? customize.add_items
		: [];
	const removeItems = Array.isArray(customize.remove_items)
		? customize.remove_items
		: [];
	if (!(addItems.length || removeItems.length)) return [];

	const blocks: CardChild[] = [Divider()];
	if (addItems.length) {
		const lines = addItems
			.slice(0, ITEM_LINES_MAX)
			.map((item) => addedItemLine(getRecord(item)));
		blocks.push(CardText([bold("Added to plan"), ...lines].join("\n")));
	}
	if (removeItems.length) {
		const lines = removeItems
			.slice(0, ITEM_LINES_MAX)
			.map((filter) => removedItemLine(getRecord(filter)));
		blocks.push(CardText([bold("Removed from plan"), ...lines].join("\n")));
	}
	return blocks;
};

// Recurring charges are expected, not a decision point — keep them muted.
const nextCycleNote = (preview: unknown) => {
	const previewBody = getPreviewBody(preview);
	const nextCycle = getRecord(previewBody.next_cycle);
	const nextTotal = getNumber(nextCycle.total);
	if (nextTotal === null) return null;
	const startsAt = getNumber(nextCycle.starts_at);
	const amount = formatMoney({
		amount: nextTotal,
		currency: getString(previewBody.currency) ?? undefined,
	});
	return `then ${amount}${startsAt ? ` from ${formatDay(startsAt)}` : ""}`;
};

// Tier 5: modifiers render only when they deviate from defaults, in muted text.
const modifierPhrases = (toolArgs?: Record<string, unknown>) => {
	const request = getRequest(toolArgs);
	if (!request) return [];
	const invoiceMode = getRecord(request.invoice_mode);
	const enableImmediately =
		request.enable_plan_immediately ?? invoiceMode.enable_plan_immediately;

	return [
		request.invoice_mode === true || invoiceMode.enabled === true
			? "billed by invoice"
			: null,
		invoiceMode.finalize === false ? "draft invoice" : null,
		enableImmediately === true
			? "access starts immediately"
			: enableImmediately === false
				? "access waits for payment"
				: null,
		getString(request.plan_schedule)
			? `plan schedule: ${request.plan_schedule}`
			: null,
		getString(request.proration_behavior)
			? `proration: ${request.proration_behavior}`
			: null,
		getString(request.redirect_mode)
			? `redirect: ${request.redirect_mode}`
			: null,
	].filter((phrase): phrase is string => Boolean(phrase));
};

const stripeInvoiceLink = ({
	env,
	invoiceId,
}: {
	env?: AppEnv;
	invoiceId: string | null;
}) => {
	if (!env || !invoiceId) return null;
	const withTest = env === "live" ? "" : "/test";
	return `https://dashboard.stripe.com${withTest}/invoices/${invoiceId}`;
};

type Outcome = {
	lines: string[];
	links: Array<{ label: string; url: string }>;
};

const requiredActionLabels: Record<string, string> = {
	"3ds_required": "Needs 3D Secure authentication",
	payment_method_required: "Customer needs a payment method on file",
	payment_failed: "Payment was declined",
};

const outcomeFromResult = ({
	customerLinkInSentence,
	env,
	result,
}: {
	customerLinkInSentence: boolean;
	env?: AppEnv;
	result: unknown;
}): Outcome => {
	if (!result) return { lines: [], links: [] };
	if (typeof result === "string") return { lines: [result], links: [] };
	if (typeof result !== "object") return { lines: [String(result)], links: [] };

	const body = result as Record<string, unknown>;
	const resultBody = getResultBody(body.result);
	const dataBody = getResultBody(body.data);
	const nested = Object.keys(resultBody).length ? resultBody : dataBody;
	const invoice = getRecord(body.invoice ?? nested.invoice);
	const requiredAction = getRecord(
		body.required_action ?? nested.required_action,
	);
	const value = (key: string) => body[key] ?? nested[key];

	const message = getString(value("message"));
	const status = getString(value("status"));
	const invoiceStatus = getString(invoice.status);
	const invoiceTotal = getNumber(invoice.total);
	const invoiceDraft = invoiceStatus === "draft";
	const dashboardUrl = stripeInvoiceLink({
		env,
		invoiceId: getString(invoice.stripe_id),
	});
	// Drafts have no payable hosted page — the dashboard is the actionable link.
	const invoiceLink = invoiceDraft
		? (dashboardUrl ?? getString(invoice.hosted_invoice_url))
			? {
					label: "Open draft in Stripe",
					url: (dashboardUrl ??
						getString(invoice.hosted_invoice_url)) as string,
				}
			: null
		: (getString(invoice.hosted_invoice_url) ?? dashboardUrl)
			? {
					label: "View invoice",
					url: (getString(invoice.hosted_invoice_url) ??
						dashboardUrl) as string,
				}
			: null;
	const requiredActionCode = getString(requiredAction.code);
	const requiredActionReason = getString(requiredAction.reason);
	const requiredActionLine = requiredActionCode
		? `${requiredActionLabels[requiredActionCode] ?? `Needs: ${requiredActionCode}`}${
				requiredActionReason ? ` — ${requiredActionReason}` : ""
			}`
		: requiredActionReason
			? `Needs: ${requiredActionReason}`
			: null;
	const paymentUrl = getString(value("payment_url"));
	const checkoutUrl = getString(value("checkout_url"));
	const url = getString(value("url"));
	const customerUrl = customerLinkInSentence
		? null
		: autumnCustomerLink({ customerId: getString(value("customer_id")), env });
	// The server reuses the hosted invoice URL as payment_url for open invoices.
	const checkoutLink =
		paymentUrl && paymentUrl !== invoiceLink?.url
			? paymentUrl
			: (!paymentUrl && checkoutUrl) || null;

	const lines = [
		message,
		invoiceStatus
			? `${capitalize(invoiceStatus)} invoice${
					invoiceTotal !== null
						? ` — ${formatMoney({
								amount: invoiceTotal,
								currency: getString(invoice.currency) ?? undefined,
							})}`
						: ""
				}`
			: null,
		status ? `Status: ${status}` : null,
		requiredActionLine,
	]
		.filter((line): line is string => Boolean(line))
		.slice(0, 4);

	const links = [
		invoiceLink,
		checkoutLink ? { label: "Open checkout", url: checkoutLink } : null,
		customerUrl ? { label: "View customer", url: customerUrl } : null,
		!(invoiceLink || checkoutLink || customerUrl) && url
			? { label: "Open link", url }
			: null,
	]
		.filter((link): link is { label: string; url: string } => Boolean(link))
		.slice(0, 3);

	return { lines, links };
};

const SUMMARY_MAX_LENGTH = 1500;

// Agent prose arrives as markdown; mrkdwn sections have no list syntax.
const formatSummary = (summary: string) => {
	const cleaned = summary
		.trim()
		.replace(/^[-*]\s+/gm, "• ")
		.replace(/^#+\s+/gm, "");
	return cleaned.length > SUMMARY_MAX_LENGTH
		? `${cleaned.slice(0, SUMMARY_MAX_LENGTH)}…`
		: cleaned;
};

// Settled terminal states (dismissed/superseded) keep the full pending body so
// the in-place edit doesn't collapse; the button row becomes a status line.
// Slack can't disable buttons, so a section line is used instead of a fake one.
const settledStatusCard = ({
	env,
	preview,
	statusLabel,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	preview?: unknown;
	statusLabel: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, toolArgs, toolName });
	const fields = moneyFields({ preview, toolArgs });
	const mutedLine = contextLine([
		nextCycleNote(preview),
		...modifierPhrases(toolArgs),
	]);
	return Card({
		title: toolLabel(toolName),
		subtitle: envLine(env) || undefined,
		children: [
			CardText(`${phrases.pending}?`),
			...(fields.length ? [Fields(fields)] : []),
			...(mutedLine ? [CardText(mutedLine, { style: "muted" })] : []),
			CardText(statusLabel),
		],
	});
};

export const approvalCard = ({
	env,
	id,
	preview,
	requesterId,
	summary,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	id: string;
	preview?: unknown;
	requesterId?: string;
	/** The agent's preview prose — rendered inside the card so the approval is one message. */
	summary?: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, toolArgs, toolName });
	const fields = moneyFields({ preview, toolArgs });
	const mutedNotes = [nextCycleNote(preview), ...modifierPhrases(toolArgs)];
	const requester = mention(requesterId);
	const live = env === "live";
	const summaryText = summary?.trim() ? formatSummary(summary) : null;
	const mutedLine = contextLine(mutedNotes);

	return Card({
		title: toolLabel(toolName),
		subtitle:
			contextLine([
				envLine(env),
				requester ? `requested by ${requester}` : null,
			]) || undefined,
		children: [
			// The agent's narrative replaces the canned sentence when present.
			CardText(summaryText ?? `${phrases.pending}?`),
			...(fields.length ? [Fields(fields)] : []),
			...itemChangeBlocks(toolArgs),
			...(mutedLine ? [CardText(mutedLine, { style: "muted" })] : []),
			Actions([
				Button({
					id: "approve_billing_action",
					label: live ? "Approve in Live" : "Approve",
					style: "primary",
					value: id,
				}),
				Button({
					id: "cancel_billing_action",
					label: "Dismiss",
					value: id,
				}),
				Button({
					actionType: "modal",
					id: "view_approval_payload",
					label: "{} Payload",
					value: id,
				}),
			]),
		],
	});
};

// Slack caps modal titles at 24 chars and section text at ~3000.
const MODAL_JSON_MAX_LENGTH = 2800;

export const approvalPayloadModal = ({
	env,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	// Only the request body matters to the reviewer — not wrapper fields
	// like the agent's `intent` note.
	const json = JSON.stringify(getRequest(toolArgs) ?? {}, null, 2);
	const truncated =
		json.length > MODAL_JSON_MAX_LENGTH
			? `${json.slice(0, MODAL_JSON_MAX_LENGTH)}\n… (truncated)`
			: json;

	return Modal({
		callbackId: "approval_payload_modal",
		closeLabel: "Close",
		submitLabel: "Done",
		title: "Tool payload",
		children: [
			CardText(contextLine([`\`${toolName}\` request`, envLine(env)]), {
				style: "muted",
			}),
			CardText(`\`\`\`\n${truncated}\n\`\`\``),
		],
	});
};

export const approvalStatusCard = ({
	actorId,
	env,
	preview,
	result,
	status,
	statusLine,
	toolArgs,
	toolName,
}: {
	actorId?: string;
	env?: AppEnv;
	preview?: unknown;
	result?: unknown;
	status: ApprovalCardStatus;
	statusLine?: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, toolArgs, toolName });
	const actor = mention(actorId);
	const where = envLine(env);
	const mutedContext = (parts: Array<string | null | undefined>) => {
		const line = contextLine(parts);
		return line ? [CardText(line, { style: "muted" })] : [];
	};

	// The "…" on the running sentence already signals in-progress; the ▸ line
	// only appears once the action reports concrete progress.
	if (status === "running") {
		const fields = moneyFields({ preview, toolArgs });
		const mutedLine = contextLine([
			nextCycleNote(preview),
			...modifierPhrases(toolArgs),
		]);
		return Card({
			title: toolLabel(toolName),
			subtitle:
				contextLine([where, actor ? `approved by ${actor}` : null]) ||
				undefined,
			children: [
				CardText(`${phrases.running}…`),
				...(fields.length ? [Fields(fields)] : []),
				...itemChangeBlocks(toolArgs),
				...(mutedLine ? [CardText(mutedLine, { style: "muted" })] : []),
				...(statusLine
					? [CardText(`▸ ${statusLine}`, { style: "muted" })]
					: []),
			],
		});
	}

	if (status === "cancelled") {
		return settledStatusCard({
			env,
			preview,
			statusLabel: `Dismissed${actor ? ` by ${actor}` : ""}`,
			toolArgs,
			toolName,
		});
	}

	if (status === "superseded") {
		return settledStatusCard({
			env,
			preview,
			statusLabel: "Superseded",
			toolArgs,
			toolName,
		});
	}

	if (status === "expired") {
		return Card({
			children: [
				CardText(
					`⌛ ${phrases.pending} — this approval expired before anyone acted on it. Ask again to retry.`,
				),
				...mutedContext([where]),
			],
		});
	}

	const customerLinkInSentence = Boolean(
		autumnCustomerLink({
			customerId: getString(getRequest(toolArgs)?.customer_id),
			env,
		}),
	);
	const outcome = outcomeFromResult({ customerLinkInSentence, env, result });

	// Resolved cards keep the pending body (sentence, money facts, changes) so the
	// edit-in-place doesn't collapse; only the buttons become the outcome row.
	const fields = moneyFields({ preview, toolArgs });
	const mutedLine = contextLine([
		nextCycleNote(preview),
		...modifierPhrases(toolArgs),
	]);
	const resolvedSubtitle =
		contextLine([where, actor ? `approved by ${actor}` : null]) || undefined;
	const resolvedBody = [
		...(fields.length ? [Fields(fields)] : []),
		...itemChangeBlocks(toolArgs),
		...(mutedLine ? [CardText(mutedLine, { style: "muted" })] : []),
	];

	if (status === "failed") {
		const lines = outcome.lines.length ? outcome.lines : ["The action failed."];
		return Card({
			title: toolLabel(toolName),
			subtitle: resolvedSubtitle,
			children: [
				CardText(`⚠️ ${phrases.failed}`),
				...resolvedBody,
				CardText(lines.join("\n")),
			],
		});
	}

	return Card({
		title: toolLabel(toolName),
		subtitle: resolvedSubtitle,
		children: [
			CardText(`✅ ${phrases.done}`),
			...resolvedBody,
			...(outcome.lines.length ? [CardText(outcome.lines.join("\n"))] : []),
			...(outcome.links.length
				? [
						Actions(
							outcome.links.map((link) =>
								LinkButton({ label: link.label, url: link.url }),
							),
						),
					]
				: []),
			...(config ? [CardText(config, { style: "muted" })] : []),
		],
	});
};
