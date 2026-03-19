import type { Autumn } from "autumn-js";
import type { ActionEvent } from "chat";
import { Actions, Card, Field, Fields, LinkButton, CardText as Text } from "chat";
import { runAgentWithContext } from "@/agent/handler";
import {
	mapBasePrice,
	mapCustomize,
	mapFreeTrial,
	mapPlanItems,
	num,
	parseApiError,
	str,
} from "@/agent/shared";
import { getWorkspaceIdFromRaw } from "@/lib/slack";
import { createAutumnClient } from "@/services/autumn";
import { getWorkspace } from "@/services/workspace";
import { formatNumber } from "@/utils/formatters";

const AUTUMN_APP_URL = "https://app.useautumn.com";

type ActionData = Record<string, unknown>;

type CardConfig = {
	title: string;
	fields?: [string, string][];
	text?: string;
	links?: Parameters<typeof LinkButton>[0][];
};

type ActionHandler = {
	required: string[];
	describe: (d: ActionData) => string;
	execute: (autumn: Autumn, d: ActionData) => Promise<unknown>;
	card: (d: ActionData, result: unknown) => CardConfig | null;
	fallback?: string;
};

function customerUrl(id: string): string {
	return `${AUTUMN_APP_URL}/customers/${encodeURIComponent(id)}`;
}

function successCard(config: CardConfig) {
	const children = [];
	if (config.text) {
		children.push(Text(config.text));
	}
	if (config.fields?.length) {
		children.push(Fields(config.fields.map(([label, value]) => Field({ label, value }))));
	}
	if (config.links?.length) {
		children.push(Actions(config.links.map((l) => LinkButton(l))));
	}
	return Card({ title: config.title, children });
}

const actions: Record<string, ActionHandler> = {
	create_customer: {
		required: ["email"],
		describe: (d) => `create customer *${d.email || d.name}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				email: str(d.email),
			};
			if (d.id) params.customerId = str(d.id);
			if (d.name) params.name = str(d.name);
			return autumn.customers.getOrCreate(
				params as Parameters<typeof autumn.customers.getOrCreate>[0],
			);
		},
		card: (d, result) => {
			const res = result as Record<string, unknown> | undefined;
			const customerId = str(d.id || res?.id);
			const fields: [string, string][] = [];
			if (d.name) fields.push(["Name", str(d.name)]);
			fields.push(["Email", `\`${str(d.email)}\``]);
			if (customerId) fields.push(["ID", `\`${customerId}\``]);
			const links = customerId
				? [{ label: "View Customer", url: customerUrl(customerId) }]
				: [{ label: "View All Customers", url: `${AUTUMN_APP_URL}/customers` }];
			return {
				title: "Customer Created",
				fields,
				text: customerId
					? undefined
					: "The customer will appear in your dashboard once they interact with your product.",
				links,
			};
		},
	},
	create_balance: {
		required: ["customer_id", "feature_id"],
		describe: (d) => `create balance for *${d.customer_id}*`,
		execute: (autumn, d) =>
			autumn.balances.create({
				customerId: str(d.customer_id),
				featureId: str(d.feature_id),
				included: num(d.amount),
			}),
		card: (d) => ({
			title: "Balance Created",
			fields: [
				["Customer", str(d.customer_id)],
				["Feature", str(d.feature_id)],
				["Amount", `+${formatNumber(num(d.amount))}`],
			],
			links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
		}),
	},
	set_balance: {
		required: ["customer_id", "feature_id"],
		describe: (d) => `set balance for *${d.customer_id}*`,
		execute: (autumn, d) =>
			autumn.balances.update({
				customerId: str(d.customer_id),
				featureId: str(d.feature_id),
				remaining: num(d.balance),
			}),
		card: (d) => ({
			title: "Balance Updated",
			fields: [
				["Customer", str(d.customer_id)],
				["Feature", str(d.feature_id)],
				["New Balance", formatNumber(num(d.balance))],
			],
			links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
		}),
	},
	track_usage: {
		required: ["customer_id", "feature_id"],
		describe: (d) => `track usage for *${d.customer_id}*`,
		execute: (autumn, d) =>
			autumn.track({
				customerId: str(d.customer_id),
				featureId: str(d.feature_id),
				value: num(d.value, 1),
			}),
		card: (d) => {
			const value = num(d.value, 1);
			return {
				title: "Usage Tracked",
				fields: [
					["Customer", str(d.customer_id)],
					["Feature", str(d.feature_id)],
					["Value", `${value >= 0 ? "+" : ""}${formatNumber(value)}`],
				],
				links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
			};
		},
	},
	attach_plan: {
		required: ["customer_id", "plan_id"],
		describe: (d) => `attach *${d.plan_id}* to *${d.customer_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				customerId: str(d.customer_id),
				planId: str(d.plan_id),
			};
			const customize = mapCustomize(d.customize);
			if (customize) params.customize = customize;
			if (d.success_url) params.successUrl = d.success_url;
			if (d.invoice_mode && typeof d.invoice_mode === "object") {
				const im = d.invoice_mode as Record<string, unknown>;
				params.invoiceMode = {
					enabled: im.enabled ?? true,
					enablePlanImmediately: im.enable_plan_immediately,
					finalize: im.finalize,
				};
			}
			return autumn.billing.attach(params as Parameters<typeof autumn.billing.attach>[0]);
		},
		card: (d, result) => {
			const res = result as {
				paymentUrl?: string | null;
				invoice?: { hostedInvoiceUrl?: string; status?: string; id?: string } | null;
				requiredAction?: { reason?: string } | null;
			};
			const fields: [string, string][] = [
				["Customer", str(d.customer_id)],
				["Plan", str(d.plan_id)],
			];
			const links: Parameters<typeof LinkButton>[0][] = [];

			if (res.paymentUrl) {
				links.push({ label: "Checkout URL", url: res.paymentUrl, style: "primary" as const });
				links.push({ label: "View Customer", url: customerUrl(str(d.customer_id)) });
				return {
					title: "Checkout Link Generated",
					fields,
					text: "Share this link with the customer to complete payment.",
					links,
				};
			}

			if (res.invoice) {
				const status = res.invoice.status === "draft" ? "Draft" : res.invoice.status || "Created";
				fields.push(["Invoice", `${status}${res.invoice.id ? ` (\`${res.invoice.id}\`)` : ""}`]);
				if (res.invoice.hostedInvoiceUrl) {
					links.push({
						label: "View Invoice in Stripe",
						url: res.invoice.hostedInvoiceUrl,
						style: "primary" as const,
					});
				}
				links.push({ label: "View Customer", url: customerUrl(str(d.customer_id)) });
				return {
					title: "Draft Invoice Created",
					fields,
					text: "Review and send the invoice from your Stripe dashboard.",
					links,
				};
			}

			links.push({ label: "View Customer", url: customerUrl(str(d.customer_id)) });
			return { title: "Plan Attached", fields, links };
		},
	},
	create_plan: {
		required: ["plan_id", "name"],
		describe: (d) => `create plan *${d.plan_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				planId: str(d.plan_id),
				name: str(d.name),
			};
			if (d.group) params.group = str(d.group);
			if (d.description) params.description = str(d.description);
			if (d.add_on != null) params.addOn = !!d.add_on;
			if (d.auto_enable != null) params.autoEnable = !!d.auto_enable;
			const price = mapBasePrice(d.price);
			if (price) params.price = price;
			const items = mapPlanItems(d.items);
			if (items) params.items = items;
			const trial = mapFreeTrial(d.free_trial);
			if (trial) params.freeTrial = trial;
			return autumn.plans.create(params as Parameters<typeof autumn.plans.create>[0]);
		},
		card: (d) => {
			const fields: [string, string][] = [
				["Plan ID", `\`${str(d.plan_id)}\``],
				["Name", str(d.name)],
			];
			if (d.group) fields.push(["Group", str(d.group)]);
			if (d.add_on) fields.push(["Add-on", "Yes"]);
			const items = d.items as unknown[] | undefined;
			if (items?.length) fields.push(["Features", `${items.length} item(s)`]);
			return {
				title: "Plan Created",
				fields,
				links: [{ label: "View in Autumn", url: `${AUTUMN_APP_URL}/products/${str(d.plan_id)}` }],
			};
		},
	},
	update_plan: {
		required: ["plan_id"],
		describe: (d) => `update plan *${d.plan_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				planId: str(d.plan_id),
			};
			if (d.name) params.name = str(d.name);
			if (d.description != null) params.description = str(d.description);
			if (d.group) params.group = str(d.group);
			if (d.add_on != null) params.addOn = !!d.add_on;
			if (d.auto_enable != null) params.autoEnable = !!d.auto_enable;
			if (d.archived != null) params.archived = !!d.archived;
			const price = mapBasePrice(d.price);
			if (price !== undefined) params.price = price;
			const items = mapPlanItems(d.items);
			if (items) params.items = items;
			const trial = mapFreeTrial(d.free_trial);
			if (trial !== undefined) params.freeTrial = trial;
			return autumn.plans.update(params as Parameters<typeof autumn.plans.update>[0]);
		},
		card: (d) => {
			const fields: [string, string][] = [["Plan ID", `\`${str(d.plan_id)}\``]];
			if (d.name) fields.push(["Name", str(d.name)]);
			if (d.archived) fields.push(["Status", "Archived"]);
			return {
				title: "Plan Updated",
				text: "A new version was created. Existing customers keep their current version.",
				fields,
				links: [{ label: "View in Autumn", url: `${AUTUMN_APP_URL}/products/${str(d.plan_id)}` }],
			};
		},
	},
	update_subscription: {
		required: ["customer_id", "plan_id"],
		describe: (d) => `update *${d.plan_id}* for *${d.customer_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				customerId: str(d.customer_id),
				planId: str(d.plan_id),
			};
			if (d.cancel_action) params.cancelAction = d.cancel_action;
			if (d.feature_quantities) params.featureQuantities = d.feature_quantities;
			const customize = mapCustomize(d.customize);
			if (customize) params.customize = customize;
			return autumn.billing.update(params as Parameters<typeof autumn.billing.update>[0]);
		},
		card: (d) => ({
			title: "Subscription Updated",
			fields: [
				["Customer", str(d.customer_id)],
				["Plan", str(d.plan_id)],
			],
			links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
		}),
	},
	generate_checkout_url: {
		required: ["customer_id", "plan_id"],
		describe: (d) => `generate checkout for *${d.customer_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = {
				customerId: str(d.customer_id),
				planId: str(d.plan_id),
			};
			if (d.customize) params.customize = d.customize;
			if (d.success_url) params.successUrl = d.success_url;
			return autumn.billing.attach(params as Parameters<typeof autumn.billing.attach>[0]);
		},
		card: (d, result) => {
			const paymentUrl = (result as { paymentUrl?: string | null }).paymentUrl;
			if (paymentUrl) {
				return {
					title: "Checkout URL",
					fields: [
						["Customer", str(d.customer_id)],
						["Plan", str(d.plan_id)],
					],
					links: [
						{ label: "Open Checkout", url: paymentUrl, style: "primary" as const },
						{ label: "View Customer", url: customerUrl(str(d.customer_id)) },
					],
				};
			}
			return {
				title: "Plan Attached",
				text: `Attached *${str(d.plan_id)}* to *${str(d.customer_id)}* (no payment required).`,
				links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
			};
		},
	},
	setup_payment: {
		required: ["customer_id"],
		describe: (d) => `set up payment for *${d.customer_id}*`,
		execute: (autumn, d) => autumn.billing.setupPayment({ customerId: str(d.customer_id) }),
		card: (d, result) => {
			const paymentUrl = (result as { url?: string }).url;
			if (!paymentUrl) return null;
			return {
				title: "Payment Setup",
				fields: [["Customer", str(d.customer_id)]],
				links: [
					{ label: "Setup Payment", url: paymentUrl, style: "primary" as const },
					{ label: "View Customer", url: customerUrl(str(d.customer_id)) },
				],
			};
		},
		fallback: "Payment setup completed but no URL was returned.",
	},
	update_customer: {
		required: ["customer_id"],
		describe: (d) => `update customer *${d.customer_id}*`,
		execute: (autumn, d) => {
			const params: Record<string, unknown> = { customerId: str(d.customer_id) };
			if (d.name) params.name = d.name;
			if (d.email) params.email = d.email;
			return autumn.customers.update(params as Parameters<typeof autumn.customers.update>[0]);
		},
		card: (d) => {
			const fields: [string, string][] = [["Customer", str(d.customer_id)]];
			if (d.name) fields.push(["Name", str(d.name)]);
			if (d.email) fields.push(["Email", `\`${str(d.email)}\``]);
			return {
				title: "Customer Updated",
				fields,
				links: [{ label: "View in Autumn", url: customerUrl(str(d.customer_id)) }],
			};
		},
	},
	create_referral_code: {
		required: ["customer_id", "program_id"],
		describe: (d) => `create referral code for *${d.customer_id}*`,
		execute: (autumn, d) =>
			autumn.referrals.createCode({
				customerId: str(d.customer_id),
				programId: str(d.program_id),
			}),
		card: (d, result) => ({
			title: "Referral Code Created",
			fields: [
				["Code", (result as { code?: string }).code || "unknown"],
				["Customer", str(d.customer_id)],
				["Program", str(d.program_id)],
			],
			links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
		}),
	},
	redeem_referral_code: {
		required: ["code", "customer_id"],
		describe: (d) => `redeem referral code for *${d.customer_id}*`,
		execute: (autumn, d) =>
			autumn.referrals.redeemCode({
				code: str(d.code),
				customerId: str(d.customer_id),
			}),
		card: (d) => ({
			title: "Referral Code Redeemed",
			fields: [
				["Code", str(d.code)],
				["Customer", str(d.customer_id)],
			],
			links: [{ label: "View Customer", url: customerUrl(str(d.customer_id)) }],
		}),
	},
};

export async function handleConfirmAction(event: ActionEvent): Promise<void> {
	if (!event.value) {
		await event.thread.post("No action data found.");
		return;
	}

	const edit = (text: string) =>
		event.adapter.editMessage(event.threadId, event.messageId, { markdown: text });

	let actionData: ActionData & { action: string };
	try {
		actionData = JSON.parse(event.value);
	} catch {
		await edit("Invalid action data.");
		return;
	}

	const workspaceId = getWorkspaceIdFromRaw(event.raw);
	if (!workspaceId) {
		await edit("Could not resolve workspace for this action.");
		return;
	}

	const workspace = await getWorkspace(workspaceId);
	if (!workspace) {
		await edit("Workspace not connected.");
		return;
	}

	const autumn = createAutumnClient(workspace);
	const confirmedBy = event.user.fullName || event.user.userId;
	const handler = actions[actionData.action];

	if (!handler) {
		await edit(`Unknown action: ${actionData.action}`);
		return;
	}

	const missing = handler.required.find((k) => {
		const v = actionData[k];
		return v == null || v === "";
	});
	if (missing) {
		await edit(`Invalid ${actionData.action} payload.`);
		return;
	}

	const desc = handler.describe(actionData);

	try {
		console.log(
			`confirm ${actionData.action} org=${workspace.orgSlug} user=${confirmedBy} ${desc}`,
		);

		await event.adapter.editMessage(event.threadId, event.messageId, {
			markdown: `_Working on it..._`,
		});

		const result = await handler.execute(autumn, actionData);
		const keys = result && typeof result === "object" ? Object.keys(result).join(",") : "";
		console.log(
			`confirm ${actionData.action} ok org=${workspace.orgSlug}${keys ? ` keys=${keys}` : ""}`,
		);
		const cardConfig = handler.card(actionData, result);
		if (cardConfig) {
			await event.adapter.editMessage(event.threadId, event.messageId, successCard(cardConfig));
		} else if (handler.fallback) {
			await event.adapter.editMessage(event.threadId, event.messageId, {
				markdown: handler.fallback,
			});
		}
	} catch (err) {
		const reason = parseApiError(err);
		console.error(
			`confirm ${actionData.action} err="${reason}" org=${workspace.orgSlug} thread=${event.threadId}`,
		);
		const plain = `I tried to ${desc} but it failed: ${reason}`;
		await event.adapter.editMessage(event.threadId, event.messageId, {
			markdown: plain.replace(/\*/g, "`"),
		});
		const depth = Number(actionData._recoveryDepth) || 0;
		await runAgentWithContext(
			event.thread,
			event.raw,
			`The confirmed action failed: could not ${desc}. Error: ${reason}. Look up the correct IDs and try again.`,
			depth + 1,
		);
	}
}

export async function handleCancelAction(event: ActionEvent): Promise<void> {
	const name = event.user.fullName || event.user.userId;

	let desc = "";
	try {
		const data = event.value ? JSON.parse(event.value) : null;
		if (data?.action) {
			const handler = actions[data.action];
			if (handler) desc = handler.describe(data).replace(/\*/g, "");
		}
	} catch {}

	const plain = desc
		? `I canceled the action to ${desc} as requested by ${name}.`
		: `Canceled by ${name}.`;
	await event.adapter.editMessage(event.threadId, event.messageId, {
		markdown: plain.replace(/\*/g, "`"),
	});
}
