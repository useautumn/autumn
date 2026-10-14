import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type VercelMarketplaceEventType =
	| "marketplace.invoice.created"
	| "marketplace.invoice.paid"
	| "marketplace.invoice.notpaid"
	| "marketplace.invoice.refunded";

export interface VercelMarketplaceInvoicePayload {
	installationId: string;
	invoiceId: string;
	externalInvoiceId: string;
	invoiceTotal: string;
	period: { start: string; end: string };
	invoiceDate: string;
}

export interface VercelMarketplaceInvoiceRefundedPayload {
	installationId: string;
	invoiceId: string;
	externalInvoiceId: string;
	amount: string;
	reason: string;
	period: { start: string; end: string };
}

interface VercelWebhookClientConfig {
	orgId: string;
	env: AppEnv;
	clientSecret: string;
	baseUrl?: string;
	headers?: Record<string, string>;
}

export class VercelWebhookClient {
	private orgId: string;
	private env: AppEnv;
	private clientSecret: string;
	private baseUrl: string;
	private headers: Record<string, string>;

	constructor({
		orgId,
		env,
		clientSecret,
		baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080",
		headers = {},
	}: VercelWebhookClientConfig) {
		this.orgId = orgId;
		this.env = env;
		this.clientSecret = clientSecret;
		this.baseUrl = baseUrl;
		this.headers = headers;
	}

	private get webhookUrl(): string {
		return `${this.baseUrl.replace(/\/$/, "")}/webhooks/vercel/${this.orgId}/${this.env}`;
	}

	private async sendEvent({
		type,
		payload,
	}: {
		type: VercelMarketplaceEventType;
		payload:
			| VercelMarketplaceInvoicePayload
			| VercelMarketplaceInvoiceRefundedPayload;
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
				...this.headers,
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

	async invoiceRefunded(payload: VercelMarketplaceInvoiceRefundedPayload) {
		return this.sendEvent({ type: "marketplace.invoice.refunded", payload });
	}
}

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
