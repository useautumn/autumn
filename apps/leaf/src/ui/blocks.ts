import {
	type BillingChangeDisplay,
	buildBillingPreviewDisplay,
	buildCustomizeChanges,
	buildPlanItemChangeDisplay,
	customPriceText,
	formatCount,
	formatMoney,
	freeTrialText,
	parsePreviewPayload,
	phaseTimingText,
	removedPlanChanges,
} from "@autumn/render";
import type { AppEnv } from "@autumn/shared";
import {
	Actions,
	Button,
	Card,
	type CardChild,
	CardText,
	Field,
	type FieldElement,
	Fields,
	LinkButton,
	Modal,
	Select,
	SelectOption,
	Table,
} from "chat";
import {
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../internal/agentRuntime/eve/parkedInput.js";
import {
	normalizeToolName,
	toolLabel,
} from "../internal/agentRuntime/tools/toolPolicy.js";
import { attachBillingEditsFromRequest } from "../internal/approvals/domain/attachBillingEdits.js";
import { isFailedApprovalPreview } from "../internal/approvals/utils/fetchApprovalPreview.js";
import { toolRequestFromArgs } from "../internal/approvals/utils/toolRequest.js";
import {
	catalogActionToChange,
	catalogItemActionToChange,
	changeTable,
	changeTableRow,
	fanOutTable,
	planItemChangeTableRow,
	sortByChangeKind,
	writeOutcomeTable,
} from "./changeTable.js";
import {
	ACTION_FAILED_MESSAGE,
	PREVIEW_UNAVAILABLE_MESSAGE,
} from "./messages.js";
import { previewElements } from "./previewContent.js";

export type ApprovalCardStatus =
	| "approved"
	| "cancelled"
	| "expired"
	| "failed"
	| "running"
	| "superseded";

export const EDIT_APPROVAL_DETAILS_ACTION_ID = "edit_approval_details";
export const EDIT_APPROVAL_DETAILS_MODAL_ID = "edit_approval_details_modal";

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

const approvalDisplayFromPreview = (preview: unknown) =>
	getRecord(getResultBody(preview)._display);

const approvalPlanName = ({
	display,
	plan,
}: {
	display: Record<string, unknown>;
	plan: Record<string, unknown>;
}) => {
	const planId = getString(plan.plan_id);
	return (
		getString(getRecord(plan.plan).name) ??
		getString(getRecord(display.planNames)[planId ?? ""]) ??
		getString(plan.name) ??
		planId
	);
};

const capitalize = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1);

const bold = (value: string) => `**${value}**`;

const mention = (userId?: string) => (userId ? `<@${userId}>` : null);

const autumnDashboardBase = () =>
	process.env.AUTUMN_DASHBOARD_URL ?? "https://app.useautumn.com";

const autumnDashboardLink = ({
	env,
	id,
	resource,
}: {
	env?: AppEnv;
	id: string | null;
	resource: "customers" | "products";
}) => {
	if (!id || !env) return null;
	const envPath = env === "live" ? "" : "/sandbox";
	return `${autumnDashboardBase()}${envPath}/${resource}/${encodeURIComponent(id)}`;
};

const autumnDashboardLabel = ({
	env,
	id,
	label = id,
	resource,
}: {
	env?: AppEnv;
	id: string;
	label?: string;
	resource: "customers" | "products";
}) => {
	const url = autumnDashboardLink({ env, id, resource });
	return bold(url ? `<${url}|${label}>` : label);
};

const planChangeSummary = ({
	env,
	incoming,
	outgoing,
}: {
	env?: AppEnv;
	incoming: BillingChangeDisplay[];
	outgoing: BillingChangeDisplay[];
}) => {
	const incomingIds = new Set(incoming.map(({ planId }) => planId));
	const outgoingIds = new Set(outgoing.map(({ planId }) => planId));
	const added = incoming.filter(({ planId }) => !outgoingIds.has(planId));
	const removed = outgoing.filter(({ planId }) => !incomingIds.has(planId));
	const labels = (changes: BillingChangeDisplay[]) =>
		changes
			.map(({ name, planId }) =>
				autumnDashboardLabel({
					env,
					id: planId,
					label: name,
					resource: "products",
				}),
			)
			.join(", ");
	if (added.length && removed.length) {
		return `Attaching ${labels(added)} and removing ${labels(removed)}`;
	}
	if (added.length) return `Attaching ${labels(added)}`;
	if (removed.length) return `Removing ${labels(removed)}`;
	return null;
};

const contextLine = (parts: Array<string | null | undefined>) =>
	parts.filter(Boolean).join(" · ");

const formatDay = (epochMs: number) =>
	new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeZone: "UTC",
	}).format(new Date(epochMs));

/** Labels resolved once: linked for sentences, plain for table cells. */
type ActionPhrases = {
	labels: {
		customer: string;
		plainCustomer: string;
		plainPlan: string;
		plan: string;
	};
	done: string;
	failed: string;
	pending: string;
	running: string;
};

/** The preview's true removals (in-place updates excluded), named via the
 * expanded plan or the display's resolved names. */
const removedPlansFromPreview = (preview: unknown) => {
	const body = getPreviewBody(preview);
	const planNames = getRecord(approvalDisplayFromPreview(preview).planNames);
	const toChanges = (value: unknown) => {
		if (!Array.isArray(value)) return [];
		return value.flatMap((entry) => {
			const record = getRecord(entry);
			const planId = getString(record.plan_id);
			if (!planId) return [];
			const name =
				getString(getRecord(record.plan).name) ??
				getString(planNames[planId]) ??
				planId;
			return [{ name, planId }];
		});
	};
	return removedPlanChanges({
		incoming: toChanges(body.incoming),
		outgoing: toChanges(body.outgoing),
	});
};

// Tier 1 of the card hierarchy: customer and plan are the subject of the
// action, so they render as a sentence — never as label/value fields.
const actionPhrases = ({
	env,
	preview,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	preview?: unknown;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): ActionPhrases => {
	const request = toolRequestFromArgs(toolArgs) ?? {};
	const name = normalizeToolName(toolName);
	const display = approvalDisplayFromPreview(preview);
	const customer = getString(request.customer_id);
	const plan = getString(request.plan_id);
	const entity = getString(request.entity_id);
	const customerName =
		getString(display.customerName) ??
		(name === "getOrCreateCustomer" || name === "updateCustomer"
			? getString(request.name)
			: null);
	const customerEmail =
		getString(display.customerEmail) ??
		(name === "getOrCreateCustomer" || name === "updateCustomer"
			? getString(request.email)
			: null);
	const planName =
		getString(display.planName) ??
		(name === "createPlan" ? getString(request.name) : null);
	const customerText = customerName ?? customerEmail ?? customer;
	const customerLabel = customer
		? autumnDashboardLabel({
				env,
				id: customer,
				label: customerText ?? customer,
				resource: "customers",
			})
		: customerText
			? bold(customerText)
			: "the customer";
	const planLabel = plan
		? autumnDashboardLabel({
				env,
				id: plan,
				label: planName ?? plan,
				resource: "products",
			})
		: "the plan";
	const entitySuffix = entity ? ` (entity ${bold(entity)})` : "";
	const labels = {
		customer: customerLabel,
		plan: planLabel,
		// Table cells render raw text, so they need the names without link markup.
		plainCustomer: customerText ?? customer ?? "—",
		plainPlan: planName ?? plan ?? "—",
	};
	const phrasesFor = (): Omit<ActionPhrases, "labels"> => {
		switch (name) {
			case "attach": {
				const target = `${planLabel} to ${customerLabel}${entitySuffix}`;
				const removedLabels = removedPlansFromPreview(preview)
					.map((change) =>
						autumnDashboardLabel({
							env,
							id: change.planId,
							label: change.name,
							resource: "products",
						}),
					)
					.join(", ");
				const removing = (verb: string) =>
					removedLabels ? ` and ${verb} ${removedLabels}` : "";
				return {
					done: `Attached ${target}${removing("removed")}`,
					failed: `Couldn't attach ${target}`,
					pending: `Attach ${target}${removing("remove")}`,
					running: `Attaching ${target}${removing("removing")}`,
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
			case "updateCustomer": {
				return {
					done: `Updated ${customerLabel}`,
					failed: `Couldn't update ${customerLabel}`,
					pending: `Update ${customerLabel}`,
					running: `Updating ${customerLabel}`,
				};
			}
			case "getOrCreateCustomer": {
				return {
					done: `Created customer ${customerLabel}`,
					failed: `Couldn't create customer ${customerLabel}`,
					pending: `Create customer ${customerLabel}`,
					running: `Creating customer ${customerLabel}`,
				};
			}
			case "createBalance": {
				const featureId = getString(request.feature_id);
				const feature =
					getString(
						getRecord(getRecord(display.featureNames)[featureId ?? ""]).name,
					) ?? featureId;
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
	return { ...phrasesFor(), labels };
};

const pendingActionPrompt = ({
	phrases,
	toolName,
}: {
	phrases: ActionPhrases;
	toolName: string;
}) => (phrases.pending === toolLabel(toolName) ? null : `${phrases.pending}?`);

// The preview tool returns { preview: BillingPreviewResponse, ... } wrapped in
// MCP content blocks; unwrap both layers before reading money facts.
const getPreviewBody = (preview: unknown) => {
	const body = getResultBody(preview);
	// A stored write preview may still be the raw MCP envelope nested under the
	// display wrapper, so the inner value gets the same unwrapping as the outer.
	const inner = getResultBody(body.preview);
	return Object.keys(inner).length ? inner : body;
};

const moneyFields = ({ preview }: { preview?: unknown }) => {
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
	return fields.slice(0, 4);
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
	const request = toolRequestFromArgs(toolArgs);
	if (!request) return [];
	const invoiceMode = getRecord(request.invoice_mode);
	const startsAt = getNumber(request.starts_at);
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
		startsAt !== null ? `Starts: ${formatDay(startsAt)}` : null,
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
		: autumnDashboardLink({
				env,
				id: getString(value("customer_id")),
				resource: "customers",
			});
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

const HIDDEN_REQUEST_KEYS = new Set([
	"customer_id",
	"entity_id",
	"intent",
	"plan_id",
]);
const MAX_REQUEST_FIELDS = 6;
const REQUEST_FIELD_VALUE_MAX = 80;

const humanizeKey = (key: string) =>
	key.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());

const compactValue = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") {
		if (!value.trim()) return null;
		return value.length > REQUEST_FIELD_VALUE_MAX
			? `${value.slice(0, REQUEST_FIELD_VALUE_MAX)}…`
			: value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	const json = JSON.stringify(value);
	if (!json || json === "{}" || json === "[]") return null;
	return json.length > REQUEST_FIELD_VALUE_MAX
		? `${json.slice(0, REQUEST_FIELD_VALUE_MAX)}…`
		: json;
};

// Bare CRUD writes (update customer, create entity…) have no billing preview —
// show what's being written as label/value fields so the card is never empty.
const requestSummaryFields = (
	toolArgs?: Record<string, unknown>,
): FieldElement[] => {
	const request = toolRequestFromArgs(toolArgs) ?? {};
	const fields: FieldElement[] = [];
	for (const [key, value] of Object.entries(request)) {
		if (HIDDEN_REQUEST_KEYS.has(key) || key.startsWith("_")) continue;
		const rendered = compactValue(value);
		if (rendered === null) continue;
		fields.push(Field({ label: humanizeKey(key), value: rendered }));
		if (fields.length >= MAX_REQUEST_FIELDS) break;
	}
	return fields;
};

const catalogApprovalContext = (preview: unknown) => {
	const payload = parsePreviewPayload(preview);
	const display = approvalDisplayFromPreview(preview);
	const values = (key: string) =>
		Array.isArray(payload?.[key]) ? payload[key].map(getRecord) : [];
	const plans = values("plan_changes");
	const features = values("feature_changes");
	const rewards = values("reward_changes");
	const referrals = values("referral_program_changes");
	const hasChange = (value: Record<string, unknown>) =>
		value.blocked === true || catalogActionToChange(value.action) !== null;
	const changedPlans = plans.filter(
		(plan) =>
			hasChange(plan) ||
			(Array.isArray(plan.item_changes) && plan.item_changes.length > 0),
	);
	const hasOtherChanges = [...features, ...rewards, ...referrals].some(
		hasChange,
	);
	const plan =
		changedPlans.length === 1 && !hasOtherChanges ? changedPlans[0] : null;
	const planName = plan ? approvalPlanName({ display, plan }) : null;

	return { display, features, plan, planName, plans, referrals, rewards };
};

const approvalTitle = ({
	preview,
	toolName,
}: {
	preview?: unknown;
	toolName: string;
}) => {
	const fallback = toolLabel(toolName);
	if (!["updateCatalog", "updatePlan"].includes(normalizeToolName(toolName))) {
		return fallback;
	}
	const { plan, planName } = catalogApprovalContext(preview);
	if (!(plan && planName)) return fallback;
	const change = catalogActionToChange(plan.action);
	const verb =
		change === "Add" ? "Create" : change === "Remove" ? "Remove" : "Update";
	return `${verb} ${planName}`;
};

const catalogApprovalBlocks = ({
	preview,
	toolArgs,
}: {
	preview?: unknown;
	toolArgs?: Record<string, unknown>;
}): CardChild[] => {
	const { display, features, plans, referrals, rewards } =
		catalogApprovalContext(preview);
	const displayFeatureNames = getRecord(display.featureNames);
	const resourceRows = ({ values }: { values: Record<string, unknown>[] }) =>
		values.flatMap((value) => {
			const change =
				value.blocked === true
					? "Blocked"
					: catalogActionToChange(value.action);
			const id = getString(value.id);
			return change && id ? [changeTableRow({ change, details: id })] : [];
		});
	const planRows = plans.flatMap((plan) => {
		const planName = approvalPlanName({ display, plan }) ?? "Plan";
		const itemRows = (
			Array.isArray(plan.item_changes) ? plan.item_changes : []
		).flatMap((value) => {
			const change = getRecord(value);
			const item = getRecord(change.item);
			const feature = getRecord(item.feature);
			const featureId = getString(change.feature_id);
			const itemAction = catalogItemActionToChange(change.action);
			if (!(featureId && itemAction)) return [];
			const embeddedFeatureNames = Object.keys(feature).length
				? {
						[featureId]: {
							...getRecord(displayFeatureNames[featureId]),
							...getRecord(feature.display),
							name: feature.name,
						},
					}
				: {};
			const itemChange = buildPlanItemChangeDisplay({
				change: itemAction,
				item: { ...item, feature_id: featureId },
			});
			return itemChange
				? [
						planItemChangeTableRow({
							change: itemChange,
							details:
								itemChange.pricingText && !itemChange.includedText
									? null
									: getString(getRecord(item.display).primary_text),
							featureNames: {
								...displayFeatureNames,
								...embeddedFeatureNames,
							},
						}),
					]
				: [];
		});
		const customize = getRecord(plan.customize);
		const onlyChangesItems =
			itemRows.length > 0 &&
			plan.action === "updated" &&
			!plan.price_change &&
			Object.keys(getRecord(plan.previous_attributes)).length === 0 &&
			Object.keys(customize).every((key) =>
				["add_items", "remove_items", "update_items"].includes(key),
			);
		const change = catalogActionToChange(plan.action);
		const planRow =
			change && !onlyChangesItems
				? [
						changeTableRow({
							change,
							details: `${planName}${plan.will_archive === true ? " · archive" : ""}`,
						}),
					]
				: [];
		return [...planRow, ...itemRows];
	});
	const catalogRows = [
		...features.flatMap((feature) => {
			const change =
				feature.blocked === true
					? "Blocked"
					: catalogActionToChange(feature.action);
			const featureId = getString(feature.feature_id);
			const name =
				getString(getRecord(feature.feature).name) ??
				getString(getRecord(displayFeatureNames[featureId ?? ""]).name) ??
				featureId;
			return change && name
				? [
						changeTableRow({
							change,
							details: `${name}${feature.will_archive === true ? " · archive" : ""}`,
						}),
					]
				: [];
		}),
		...resourceRows({ values: rewards }),
		...resourceRows({ values: referrals }),
	];
	const tables = [
		...(catalogRows.length
			? [
					changeTable({
						caption: "Catalog changes",
						rows: sortByChangeKind(catalogRows),
					}),
				]
			: []),
		...(planRows.length
			? [
					changeTable({
						caption: "Plan changes",
						rows: sortByChangeKind(planRows),
					}),
				]
			: []),
	];
	if (tables.length) return tables;

	const request = toolRequestFromArgs(toolArgs) ?? {};
	const counts = [
		Array.isArray(request.plans) && request.plans.length
			? `${request.plans.length} plan ${request.plans.length === 1 ? "change" : "changes"}`
			: null,
		Array.isArray(request.features) && request.features.length
			? `${request.features.length} feature ${request.features.length === 1 ? "change" : "changes"}`
			: null,
	].filter((value): value is string => Boolean(value));
	return counts.length ? [CardText(counts.join(" · "))] : [];
};

const BILLING_ACTION_TOOLS = new Set([
	"attach",
	"createSchedule",
	"updateSubscription",
]);

/** A homogeneous group shows one heading and one row per target instead of
 * repeating the whole body. */
const isHomogeneousGroup = ({
	writes,
	toolName,
}: {
	writes: ReadonlyArray<{ toolName: string }>;
	toolName: string;
}) =>
	writes.length > 1 &&
	writes.every(
		(write) =>
			normalizeToolName(write.toolName) === normalizeToolName(toolName),
	);

const writeTotal = (preview?: unknown) =>
	getNumber(getPreviewBody(preview).total) ?? 0;

const writeCurrency = (preview?: unknown) =>
	getString(getPreviewBody(preview).currency) ?? undefined;

/** One row per target for a fan-out, using the same name resolution and money
 * formatting the per-write sections use. */
const fanOutBlocks = ({
	env,
	preview,
	writes,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	preview?: unknown;
	writes: ReadonlyArray<{
		input?: Record<string, unknown>;
		preview?: unknown;
		toolName: string;
	}>;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): CardChild[] => {
	const all = [{ input: toolArgs, preview, toolName }, ...writes];
	const rows = all.map((write) => {
		const phrases = actionPhrases({
			env,
			preview: write.preview,
			toolArgs: write.input,
			toolName: write.toolName,
		});
		const amount = writeTotal(write.preview);
		return [
			phrases.labels.plainCustomer,
			phrases.labels.plainPlan,
			formatMoney({ amount, currency: writeCurrency(write.preview) }),
		] as [string, string, string];
	});
	const total = all.reduce((sum, write) => sum + writeTotal(write.preview), 0);
	return [
		// The card header already names the operation, so the table only labels
		// how many targets it covers.
		fanOutTable({
			caption: `${all.length} customers`,
			headers: ["Customer", "Plan", "Due now"],
			rows,
		}),
		CardText(
			`*Total*  *${formatMoney({ amount: total, currency: writeCurrency(preview) })}*`,
		),
	];
};

/** Grouped writes render through the same body builder as standalone cards;
 * the tense tracks whether the card is still in progress. */
type StepTense = "done" | "failed" | "running";

const withheldWriteBlocks = ({
	env,
	writes,
	tense,
}: {
	env?: AppEnv;
	writes: ReadonlyArray<WithheldWrite>;
	tense: StepTense;
}): CardChild[] =>
	writes.flatMap((write) => {
		const phrases = actionPhrases({
			env,
			preview: write.preview,
			toolArgs: write.input,
			toolName: write.toolName,
		});
		return [
			// Same heading the write would carry as its own card, so each write in
			// a group reads as a distinct operation.
			CardText(
				`*${approvalTitle({ preview: write.preview, toolName: write.toolName })}*`,
			),
			CardText(phrases[tense]),
			...approvalPreviewBlocks({
				env,
				preview: write.preview,
				toolArgs: write.input,
				toolName: write.toolName,
			}),
		];
	});

/** Shared by every card state (they edit the same message); a fan-out
 * collapses to one table, mixed writes keep a titled section each. */
const approvalBodyBlocks = ({
	env,
	preview,
	writes,
	tense = "running",
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	preview?: unknown;
	writes?: ReadonlyArray<WithheldWrite>;
	tense?: StepTense;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): CardChild[] => {
	const groupedWrites = writes ?? withheldWritesFromToolArgs(toolArgs);
	if (isHomogeneousGroup({ writes: groupedWrites, toolName })) {
		return fanOutBlocks({
			env,
			preview,
			writes: groupedWrites,
			toolArgs,
			toolName,
		});
	}
	return [
		...approvalPreviewBlocks({ env, preview, toolArgs, toolName }),
		...withheldWriteBlocks({ env, writes: groupedWrites, tense }),
	];
};

const approvalPreviewBlocks = ({
	env,
	preview,
	toolArgs,
	toolName,
}: {
	env?: AppEnv;
	preview?: unknown;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): CardChild[] => {
	const blocks: CardChild[] = [];
	const normalizedToolName = normalizeToolName(toolName);
	if (isFailedApprovalPreview(preview)) {
		blocks.push(
			CardText(PREVIEW_UNAVAILABLE_MESSAGE, { style: "muted" }),
			Fields(requestSummaryFields(toolArgs)),
		);
		return blocks;
	}
	const structured = previewElements(preview);
	const pushMoney = () => {
		if (structured) {
			blocks.push(...structured);
			return;
		}
		const fields = moneyFields({ preview });
		if (fields.length) blocks.push(Fields(fields));
	};

	if (!BILLING_ACTION_TOOLS.has(normalizedToolName)) {
		if (
			["createPlan", "createReward", "updateCatalog", "updatePlan"].includes(
				normalizedToolName,
			)
		) {
			blocks.push(...catalogApprovalBlocks({ preview, toolArgs }));
			return blocks;
		}
		pushMoney();
		// Nothing structured to show — fall back to the write's own fields.
		if (blocks.length === 0) {
			const fields = requestSummaryFields(toolArgs);
			if (fields.length) blocks.push(Fields(fields));
		}
		const mutedLine = contextLine([
			structured ? null : nextCycleNote(preview),
			...modifierPhrases(toolArgs),
		]);
		if (mutedLine) blocks.push(CardText(mutedLine, { style: "muted" }));
		return blocks;
	}

	const request = toolRequestFromArgs(toolArgs);
	const approvalDisplay = getRecord(getResultBody(preview)._display);
	const resolvedPlanNames = Object.fromEntries(
		Object.entries(getRecord(approvalDisplay.planNames)).flatMap(
			([id, value]) => {
				const name = getString(value);
				return name ? [[id, name]] : [];
			},
		),
	);
	const resolvedFeatureNames = getRecord(approvalDisplay.featureNames);
	const display = buildBillingPreviewDisplay({
		params: request ?? null,
		planNames: resolvedPlanNames,
		preview: parsePreviewPayload(preview),
	});
	const changeSummary =
		normalizedToolName === "attach"
			? null
			: planChangeSummary({ env, ...display.changes });
	if (changeSummary) {
		blocks.push(CardText(changeSummary));
	}
	// Same add/remove diff the dashboard renders, so the two surfaces agree; a
	// prepaid quantity is folded into its item row — it IS the money decision.
	const prepaidByFeature = new Map(
		display.prepaid.map((entry) => [entry.featureId, entry] as const),
	);
	const prepaidShownInline = new Set<string>();
	const prepaidItemRow = ({
		item,
		row,
	}: {
		item: unknown;
		row: ReturnType<typeof changeTableRow>;
	}) => {
		const record = getRecord(item);
		const price = getRecord(record.price);
		const featureId = getString(record.feature_id);
		const entry = featureId ? prepaidByFeature.get(featureId) : undefined;
		if (
			!featureId ||
			price.billing_method !== "prepaid" ||
			entry?.quantity == null
		) {
			return row;
		}
		prepaidShownInline.add(featureId);
		const names = getRecord(resolvedFeatureNames[featureId]);
		const feature =
			getString(entry.quantity === 1 ? names.singular : names.plural) ??
			getString(names.name) ??
			featureId;
		return {
			...row,
			details: `${formatCount(entry.quantity)} ${feature} (prepaid)`,
		};
	};
	const customizeRows = ({
		currentPlan,
		customize,
		plan,
	}: {
		currentPlan: unknown;
		customize: unknown;
		plan?: string;
	}) => {
		const details = (value: string) => (plan ? `${plan} · ${value}` : value);
		return buildCustomizeChanges({ currentPlan, customize }).flatMap(
			(change) => {
				const verb = change.kind === "add" ? "Add" : "Remove";
				if (change.subject === "price") {
					return [
						changeTableRow({
							change: verb,
							details: details("Base price"),
							pricing: customPriceText(change.price) ?? "—",
						}),
					];
				}
				if (change.subject === "free_trial") {
					return [
						changeTableRow({
							change: verb,
							details: details(freeTrialText(change.trial) ?? "Free trial"),
						}),
					];
				}
				const itemDisplay = buildPlanItemChangeDisplay({
					change: verb,
					item: change.item,
				});
				if (!itemDisplay) return [];
				const row = planItemChangeTableRow({
					change: itemDisplay,
					featureNames: resolvedFeatureNames,
				});
				const shown =
					change.kind === "add"
						? prepaidItemRow({ item: change.item, row })
						: row;
				return [{ ...shown, details: details(shown.details) }];
			},
		);
	};
	// Future-phase customizations must carry their timing or they read as the
	// immediate change the "Due now" money describes.
	const schedulePlans = [
		...(Array.isArray(request?.phases)
			? request.phases.flatMap((value, index) => {
					const phase = getRecord(value);
					const plans = Array.isArray(phase.plans)
						? phase.plans.map(getRecord)
						: [];
					const timing = phaseTimingText({ index, phase });
					return plans.map((plan) => ({
						plan,
						timing: timing === "now" ? null : timing,
					}));
				})
			: []),
		...(Array.isArray(request?.unscheduled_plans)
			? request.unscheduled_plans.map((value) => ({
					plan: getRecord(value),
					timing: null,
				}))
			: []),
	];
	const planNames = new Map([
		...Object.entries(resolvedPlanNames),
		...[...display.changes.incoming, ...display.changes.outgoing].map(
			({ name, planId }) => [planId, name] as const,
		),
	]);
	// Display data resolved before this change carries only the plan's items;
	// newer rows carry the whole plan. Accept either so stored cards still diff.
	const currentPlanByPlan = getRecord(approvalDisplay.currentPlanByPlan);
	const basePlanItemsByPlan = getRecord(approvalDisplay.basePlanItemsByPlan);
	const currentPlanFor = (planId: string | null) => {
		if (!planId) return approvalDisplay.currentPlan ?? null;
		const whole = currentPlanByPlan[planId];
		if (whole) return whole;
		const items = basePlanItemsByPlan[planId];
		return Array.isArray(items) ? { items } : null;
	};
	const primaryCurrentPlan =
		approvalDisplay.currentPlan ??
		(Array.isArray(approvalDisplay.basePlanItems)
			? { items: approvalDisplay.basePlanItems }
			: null);
	const changeRows = [
		...customizeRows({
			currentPlan: primaryCurrentPlan,
			customize: request?.customize,
		}),
		...schedulePlans.flatMap(({ plan, timing }) => {
			const planId = getString(plan.plan_id) ?? "Plan";
			const planLabel = planNames.get(planId) ?? planId;
			return customizeRows({
				currentPlan: currentPlanFor(planId),
				customize: plan.customize,
				plan: timing ? `${planLabel} (${timing})` : planLabel,
			});
		}),
	];
	// The "Plan changes" table already names the operation, so the generic
	// intent label only earns its place when there is no table beneath it.
	const intentLabel =
		normalizedToolName !== "attach" && changeRows.length === 0
			? display.intentLabel
			: null;
	if (intentLabel) {
		blocks.push(CardText(intentLabel));
	}
	if (changeRows.length) {
		blocks.push(changeTable({ caption: "Plan changes", rows: changeRows }));
	}
	// Prepaid quantities are silent money decisions — an omitted quantity
	// defaults to 0 server-side, so the approver must see it either way.
	const prepaidLines = display.prepaid
		.filter((entry) => !prepaidShownInline.has(entry.featureId))
		.map((entry) => {
			const feature = getRecord(resolvedFeatureNames[entry.featureId]);
			const featureName = getString(feature.name) ?? entry.featureId;
			return entry.quantity !== null
				? `${featureName} — ${formatCount(entry.quantity)} prepaid`
				: `⚠️ ${featureName} — prepaid quantity not set (defaults to 0${
						entry.includedDefault
							? `; plan includes ${formatCount(entry.includedDefault)}`
							: ""
					})`;
		});
	if (prepaidLines.length) {
		blocks.push(CardText([bold("Quantities"), ...prepaidLines].join("\n")));
	}
	// A single line item that just restates the due-now total is noise.
	const listableItems =
		display.lineItems.length === 1 &&
		display.lineItems[0].amount === display.dueNow?.amount
			? []
			: display.lineItems.slice(0, 8);
	// A $0 due-now with no line items isn't a money fact — mute it. When the
	// "No billing changes" badge already gives the reason, say nothing at all.
	const explainedByBadge = display.badges.some(
		({ label }) => label === "No billing changes",
	);
	const zeroNoCharge =
		display.dueNow?.amount === 0 &&
		listableItems.length === 0 &&
		!display.refund;
	const moneyLines = zeroNoCharge
		? []
		: [
				...listableItems.map((item) => `• ${item.name}  ${item.amountText}`),
				...(display.dueNow
					? [
							`${bold(display.isCredit ? "Credit due now" : "Due now")}  ${bold(
								display.isCredit
									? formatMoney({
											amount: Math.abs(display.dueNow.amount),
											currency: display.currency,
										})
									: display.dueNow.text,
							)}`,
						]
					: []),
				...(display.refund
					? [`${bold("Refund")}  ${bold(display.refund.text)}`]
					: []),
			];
	if (moneyLines.length) {
		blocks.push(CardText(moneyLines.join("\n")));
	} else if (zeroNoCharge && !explainedByBadge) {
		blocks.push(CardText("No charge now", { style: "muted" }));
	} else if (!zeroNoCharge) {
		pushMoney();
	}
	if (display.phases.length) {
		blocks.push(
			Table({
				align: ["left", "left"],
				caption: "Schedule",
				headers: ["Starts", "Plans"],
				rows: display.phases.map((phase) => [
					phase.timingText,
					phase.plansText,
				]),
			}),
		);
	}
	const badges = [
		...display.badges,
		...(display.redirectToCheckout &&
		!display.badges.some(({ label }) => label === "Checkout link")
			? [{ active: true, label: "Checkout link" }]
			: []),
	];
	const badgeLine = badges
		.map(({ active, label }) => {
			if (label === "Invoice (draft)") return "Draft invoice";
			if (label === "Invoice mode")
				return active ? "Finalized invoice" : "Charge directly";
			if (label === "Enable immediately")
				return active ? "Provision immediately" : "Provision after payment";
			if (label === "Prorations") return active ? label : "No prorations";
			if (label === "Checkout link")
				return "Customer completes payment in checkout";
			return label;
		})
		.join(" · ");
	const startsAt = getNumber(request?.starts_at);
	const mutedLine = contextLine([
		display.nextCycle
			? `Next cycle${
					display.nextCycle.startsAtText
						? ` · ${display.nextCycle.startsAtText}`
						: ""
				} — ${display.nextCycle.text}`
			: null,
		startsAt !== null ? `Starts: ${formatDay(startsAt)}` : null,
	]);
	if (mutedLine) blocks.push(CardText(mutedLine, { style: "muted" }));
	if (badgeLine) blocks.push(CardText(badgeLine, { style: "muted" }));
	return blocks;
};

// Settled cards keep their pending body; Slack cannot disable buttons, so the
// action row becomes a status line.
const settledStatusCard = ({
	dashboardUrl,
	env,
	groupedWrites,
	preview,
	statusLabel,
	toolArgs,
	toolName,
}: {
	dashboardUrl?: string | null;
	env?: AppEnv;
	groupedWrites?: ReadonlyArray<WithheldWrite>;
	preview?: unknown;
	statusLabel: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, preview, toolArgs, toolName });
	const prompt = pendingActionPrompt({ phrases, toolName });
	return Card({
		title: approvalTitle({ preview, toolName }),
		children: [
			...(prompt ? [CardText(prompt)] : []),
			...approvalBodyBlocks({
				env,
				preview,
				writes: groupedWrites,
				toolArgs,
				toolName,
			}),
			CardText(statusLabel),
			...(dashboardUrl ? [Actions(viewInDashboardButton(dashboardUrl))] : []),
		],
	});
};

/** Deep link into the dashboard sheet prefilled from this approval. */
export const approvalSheetUrl = ({
	approvalId,
	customerId,
	env,
	planId,
	toolName,
}: {
	approvalId: string;
	customerId?: string;
	env?: AppEnv;
	planId?: string;
	toolName: string;
}) => {
	if (!customerId) return null;
	const base = `${autumnDashboardBase()}${env === "live" ? "" : "/sandbox"}`;
	const normalizedToolName = normalizeToolName(toolName);
	const sheet =
		normalizedToolName === "updateSubscription"
			? `sheet=subscription-update${planId ? `&plan_id=${encodeURIComponent(planId)}` : ""}`
			: normalizedToolName === "createSchedule"
				? "sheet=create-schedule"
				: "sheet=attach-product";
	return `${base}/customers/${encodeURIComponent(customerId)}?${sheet}&approval_id=${encodeURIComponent(approvalId)}`;
};

const viewInDashboardButton = (url: string | null | undefined) =>
	url ? [LinkButton({ label: "View in dashboard", url })] : [];

export const approvalCard = ({
	dashboardUrl,
	env,
	id,
	preview,
	writes,
	toolArgs,
	toolName,
}: {
	dashboardUrl?: string | null;
	env?: AppEnv;
	id: string;
	preview?: unknown;
	writes?: ReadonlyArray<WithheldWrite>;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, preview, toolArgs, toolName });
	const live = env === "live";
	const prompt =
		normalizeToolName(toolName) === "attach"
			? phrases.running
			: pendingActionPrompt({ phrases, toolName });
	const editable = normalizeToolName(toolName) === "attach";
	const groupedWrites = writes ?? withheldWritesFromToolArgs(toolArgs);

	const fanOut = isHomogeneousGroup({
		writes: groupedWrites,
		toolName,
	});

	return Card({
		title: approvalTitle({ preview, toolName }),
		children: [
			...(prompt && !fanOut ? [CardText(prompt)] : []),
			...approvalBodyBlocks({
				env,
				preview,
				writes: groupedWrites,
				toolArgs,
				toolName,
			}),
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
				...(editable
					? [
							Button({
								actionType: "modal",
								id: EDIT_APPROVAL_DETAILS_ACTION_ID,
								label: "Edit details",
								value: id,
							}),
						]
					: []),
				...viewInDashboardButton(dashboardUrl),
			]),
			CardText(
				"Need a change? Reply in this thread and I’ll refresh the preview.",
				{ style: "muted" },
			),
		],
	});
};

export const approvalDetailsModal = ({
	approvalId,
	toolArgs,
}: {
	approvalId: string;
	toolArgs?: Record<string, unknown>;
}) => {
	const request = toolRequestFromArgs(toolArgs) ?? {};
	const edits = attachBillingEditsFromRequest(request);

	return Modal({
		callbackId: EDIT_APPROVAL_DETAILS_MODAL_ID,
		closeLabel: "Cancel",
		privateMetadata: approvalId,
		submitLabel: "Update preview",
		title: "Edit billing details",
		children: [
			Select({
				id: "billing",
				initialOption: edits.billing,
				label: "Billing mode",
				options: [
					SelectOption({ label: "Checkout link", value: "checkout" }),
					SelectOption({ label: "Draft invoice", value: "draft_invoice" }),
					SelectOption({
						label: "Finalized invoice",
						value: "finalized_invoice",
					}),
				],
			}),
			Select({
				id: "access",
				initialOption: edits.access,
				label: "Provisioning",
				options: [
					SelectOption({
						label: "Provision immediately",
						value: "immediate",
					}),
					SelectOption({
						label: "Provision after payment",
						value: "after_payment",
					}),
				],
			}),
			Select({
				id: "proration",
				initialOption: edits.proration,
				label: "Proration",
				options: [
					SelectOption({
						label: "Charge prorated amount now",
						value: "immediate",
					}),
					SelectOption({
						label: "No charge until next cycle",
						value: "next_cycle",
					}),
				],
			}),
		],
	});
};

export const approvalStatusCard = ({
	actorId,
	dashboardUrl,
	env,
	groupedWrites,
	preview,
	result,
	status,
	statusLine,
	outcomes,
	toolArgs,
	toolName,
}: {
	actorId?: string;
	dashboardUrl?: string | null;
	env?: AppEnv;
	groupedWrites?: ReadonlyArray<WithheldWrite>;
	preview?: unknown;
	result?: unknown;
	status: ApprovalCardStatus;
	outcomes?: ReadonlyArray<{
		status: "applied" | "failed" | "pending" | "skipped" | "unknown";
		toolName: string;
	}>;
	statusLine?: string;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}) => {
	const phrases = actionPhrases({ env, preview, toolArgs, toolName });
	const actor = mention(actorId);

	// The "…" on the running sentence already signals in-progress; the ▸ line
	// only appears once the action reports concrete progress.
	if (status === "running") {
		return Card({
			title: approvalTitle({ preview, toolName }),
			children: [
				CardText(`${phrases.running}…`),
				...approvalBodyBlocks({
					env,
					preview,
					writes: groupedWrites,
					toolArgs,
					toolName,
				}),
				...(statusLine
					? [CardText(`▸ ${statusLine}`, { style: "muted" })]
					: []),
			],
		});
	}

	if (status === "cancelled") {
		return settledStatusCard({
			dashboardUrl,
			env,
			groupedWrites,
			preview,
			statusLabel: `Dismissed${actor ? ` by ${actor}` : ""}`,
			toolArgs,
			toolName,
		});
	}

	if (status === "superseded") {
		return settledStatusCard({
			dashboardUrl,
			env,
			groupedWrites,
			preview,
			statusLabel: statusLine
				? `🔄 ${statusLine}`
				: "🔄 Withdrawn — superseded by a newer request in this thread",
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
			],
		});
	}

	const customerLinkInSentence = Boolean(
		autumnDashboardLink({
			env,
			id: getString(toolRequestFromArgs(toolArgs)?.customer_id),
			resource: "customers",
		}),
	);
	const outcome = outcomeFromResult({ customerLinkInSentence, env, result });

	// Resolved cards keep the pending body (sentence, money facts, changes) so the
	// edit-in-place doesn't collapse; only the buttons become the outcome row.
	const resolvedBody = approvalBodyBlocks({
		env,
		preview,
		writes: groupedWrites,
		tense: status === "failed" ? "failed" : "done",
		toolArgs,
		toolName,
	});

	if (status === "failed") {
		const lines = outcome.lines.length
			? outcome.lines
			: [ACTION_FAILED_MESSAGE];
		// A half-applied group needs the per-write breakdown; a lone failed write
		// is already fully described by the message.
		const partial = (outcomes?.length ?? 0) > 1;
		return Card({
			title: approvalTitle({ preview, toolName }),
			children: [
				CardText(`⚠️ ${phrases.failed}`),
				...resolvedBody,
				...(partial && outcomes
					? [
							writeOutcomeTable({
								writes: outcomes.map((write) => ({
									status: write.status,
									summary: toolLabel(write.toolName),
								})),
							}),
						]
					: []),
				CardText(lines.join("\n")),
				...(dashboardUrl ? [Actions(viewInDashboardButton(dashboardUrl))] : []),
			],
		});
	}

	return Card({
		title: approvalTitle({ preview, toolName }),
		children: [
			CardText(`✅ ${phrases.done}`),
			...resolvedBody,
			...(outcome.lines.length ? [CardText(outcome.lines.join("\n"))] : []),
			...(outcome.links.length || dashboardUrl
				? [
						Actions([
							...outcome.links.map((link) =>
								LinkButton({ label: link.label, url: link.url }),
							),
							...viewInDashboardButton(dashboardUrl),
						]),
					]
				: []),
		],
	});
};
