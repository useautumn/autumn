import { Hono } from "hono";
import { Webhook } from "svix";
import { bot } from "@/bot";
import {
	ExpiredCard,
	NewSubscriptionCard,
	PastDueCard,
	PlanChangedCard,
	SubscriptionCanceledCard,
	SubscriptionRenewedCard,
	TrialConvertedCard,
	UsageAlertCard,
} from "@/cards/alert";
import type { WorkspaceConfig } from "@/services/workspace";
import { getWorkspace, listWorkspaces } from "@/services/workspace";

export const autumnWebhookRoutes = new Hono();

type AutumnWebhookEvent = {
	type: string;
	data: Record<string, unknown>;
	org_id?: string;
};

autumnWebhookRoutes.post("/", async (c) => {
	const svixId = c.req.header("svix-id");
	const svixTimestamp = c.req.header("svix-timestamp");
	const svixSignature = c.req.header("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return c.text("Missing Svix headers", 400);
	}

	const body = await c.req.text();
	let payload: AutumnWebhookEvent;

	try {
		payload = JSON.parse(body);
	} catch {
		return c.text("Invalid JSON", 400);
	}

	if (!payload.org_id) {
		console.warn(`Webhook missing org_id for event type: ${payload.type}`);
		return c.text("Missing org_id", 400);
	}

	const workspaces = await loadWorkspaces();
	const workspace = workspaces.find((ws) => ws.orgSlug === payload.org_id) || null;

	if (!workspace) {
		console.warn(`No workspace for webhook org_id=${payload.org_id}`);
		return c.text("OK", 200);
	}

	if (!workspace.webhookSecret) {
		console.warn(`No webhook secret configured for org_id=${payload.org_id}`);
		return c.text("OK", 200);
	}

	try {
		const wh = new Webhook(workspace.webhookSecret);
		wh.verify(body, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		});
	} catch (err) {
		console.error("Webhook verification failed:", err);
		return c.text("Webhook verification failed", 400);
	}

	try {
		console.log(`Webhook: ${payload.type}${payload.org_id ? ` (${payload.org_id})` : ""}`);
		await routeAutumnEvent(payload, workspace);
		return c.text("OK", 200);
	} catch (err) {
		console.error("Failed to process Autumn webhook:", err);
		return c.text("Webhook processing failed", 400);
	}
});

async function loadWorkspaces(): Promise<WorkspaceConfig[]> {
	const workspaceIds = await listWorkspaces();
	const workspaces = await Promise.all(workspaceIds.map((id) => getWorkspace(id)));
	return workspaces.filter((ws): ws is WorkspaceConfig => ws !== null);
}

async function routeAutumnEvent(
	event: AutumnWebhookEvent,
	workspace: WorkspaceConfig | null,
): Promise<void> {
	if (!workspace) {
		console.warn(`No workspace found for Autumn event: ${event.type}`);
		return;
	}

	if (!workspace.alertChannel) {
		console.warn(`No alert channel configured for workspace: ${workspace.workspaceId}`);
		return;
	}

	const card = buildAlertCard(event);
	if (!card) {
		console.log(`No alert card for event type: ${event.type}`);
		return;
	}

	try {
		const channelId = workspace.alertChannel.startsWith("slack:")
			? workspace.alertChannel
			: `slack:${workspace.alertChannel}`;
		await bot.channel(channelId).post(card);
	} catch (err) {
		console.error(`Failed to post alert to channel ${workspace.alertChannel}:`, err);
	}
}

function nested<T>(obj: Record<string, unknown>, key: string): T | undefined {
	return (obj[key] as T) ?? undefined;
}

function buildAlertCard(event: AutumnWebhookEvent) {
	const d = event.data;
	const customer = nested<{ id?: string; name?: string }>(d, "customer");
	const customerId = customer?.id || String(d.customer_id || "unknown");
	const customerName = customer?.name;

	switch (event.type) {
		case "customer.products.updated": {
			const scenario = String(d.scenario || "");
			const updatedProduct = nested<{ name?: string; id?: string }>(d, "updated_product");
			const previousProduct = nested<{ name?: string; id?: string }>(d, "previous_product");
			const planName = updatedProduct?.name || updatedProduct?.id || "unknown";

			switch (scenario) {
				case "cancel":
					return SubscriptionCanceledCard({
						customerId,
						customerName,
						planName,
						cancelsAt: d.cancels_at ? new Date(String(d.cancels_at)).getTime() : undefined,
					});

				case "upgrade":
				case "downgrade":
					return PlanChangedCard({
						customerId,
						customerName,
						fromPlan: previousProduct?.name || previousProduct?.id || "unknown",
						toPlan: planName,
						direction: scenario,
					});

				case "new":
					return NewSubscriptionCard({ customerId, customerName, planName });

				case "expired":
					return ExpiredCard({ customerId, customerName, planName });

				case "past_due":
					return PastDueCard({ customerId, customerName, planName });

				case "renew":
					return SubscriptionRenewedCard({ customerId, customerName, planName });

				case "scheduled":
					return PlanChangedCard({
						customerId,
						customerName,
						fromPlan: previousProduct?.name || previousProduct?.id || "unknown",
						toPlan: planName,
						direction: "change",
					});

				default: {
					if (d.was_trialing && d.status === "active") {
						return TrialConvertedCard({ customerId, customerName, planName });
					}
					return null;
				}
			}
		}

		case "customer.threshold_reached": {
			const feature = nested<{ id?: string }>(d, "feature");
			return UsageAlertCard({
				customerId,
				customerName,
				featureId: feature?.id || String(d.feature_id || "unknown"),
				thresholdType: String(d.threshold_type || "percentage"),
			});
		}

		default:
			return null;
	}
}
