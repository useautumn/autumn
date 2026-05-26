import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";

// Worktree dev servers use https://wt<N>-api.localhost with self-signed
// certs. The test process opts out of TLS validation for its own fetches.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type VercelMarketplaceEventType =
	| "marketplace.invoice.created"
	| "marketplace.invoice.paid"
	| "marketplace.invoice.notpaid";

export interface VercelMarketplaceInvoicePayload {
	installationId: string;
	invoiceId: string;
	externalInvoiceId: string;
	invoiceTotal: string;
	period: { start: string; end: string };
	invoiceDate: string;
}

interface VercelWebhookClientConfig {
	orgId: string;
	env: AppEnv;
	/**
	 * HMAC-SHA1 secret. Must match `org.processor_configs.vercel.sandbox_client_secret`
	 * (or `.client_secret` for live).
	 */
	clientSecret: string;
	baseUrl?: string;
}

/**
 * Mock client for sending Vercel marketplace webhook events in tests.
 *
 * Mirrors the shape of `RevenueCatWebhookClient` (see
 * `revenue-cat-webhook-client.ts`). Generates the `x-vercel-signature`
 * (HMAC-SHA1 over the raw JSON body) that
 * `vercelSignatureMiddleware.ts` verifies against the org's client secret.
 */
export class VercelWebhookClient {
	private orgId: string;
	private env: AppEnv;
	private clientSecret: string;
	private baseUrl: string;

	constructor({
		orgId,
		env,
		clientSecret,
		baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:8080",
	}: VercelWebhookClientConfig) {
		this.orgId = orgId;
		this.env = env;
		this.clientSecret = clientSecret;
		this.baseUrl = baseUrl;
	}

	private get webhookUrl(): string {
		return `${this.baseUrl.replace(/\/$/, "")}/webhooks/vercel/${this.orgId}/${this.env}`;
	}

	private async sendEvent({
		type,
		payload,
	}: {
		type: VercelMarketplaceEventType;
		payload: VercelMarketplaceInvoicePayload;
	}): Promise<{ response: Response; data: unknown }> {
		const body = JSON.stringify({ type, payload });
		const signature = crypto
			.createHmac("sha1", this.clientSecret)
			.update(Buffer.from(body, "utf-8"))
			.digest("hex");

		const response = await fetch(this.webhookUrl, {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/json",
				"x-vercel-signature": signature,
			},
		});

		let data: unknown;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		return { response, data };
	}

	async invoiceCreated(payload: VercelMarketplaceInvoicePayload) {
		return this.sendEvent({ type: "marketplace.invoice.created", payload });
	}

	async invoicePaid(payload: VercelMarketplaceInvoicePayload) {
		return this.sendEvent({ type: "marketplace.invoice.paid", payload });
	}

	async invoiceNotPaid(payload: VercelMarketplaceInvoicePayload) {
		return this.sendEvent({ type: "marketplace.invoice.notpaid", payload });
	}
}

/**
 * Asserts that a Vercel webhook responded with 2xx and a recognizably-success
 * body. The marketplace router uses `{ received: true }` or `{ success: true }`
 * depending on event type, so accept either.
 */
export const expectVercelWebhookSuccess = ({
	response,
	data,
}: {
	response: Response;
	data: unknown;
}) => {
	if (response.status !== 200) {
		throw new Error(
			`Expected Vercel webhook response status 200, got ${response.status}. Data: ${JSON.stringify(data)}`,
		);
	}
	const ok =
		(data as { success?: boolean })?.success === true ||
		(data as { received?: boolean })?.received === true;
	if (!ok) {
		throw new Error(
			`Expected Vercel webhook response { success | received: true }, got ${JSON.stringify(
				data,
			)}`,
		);
	}
};
