import { ErrCode, WebhookEventType } from "@autumn/shared";
import { Hono } from "hono";
import { Webhook } from "svix";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError from "@/utils/errorUtils.js";

export const autumnWebhookRouter = new Hono<HonoEnv>();

const verifyAutumnWebhook = async ({
	rawBody,
	headers,
}: {
	rawBody: string;
	headers: {
		svixId: string | undefined;
		svixTimestamp: string | undefined;
		svixSignature: string | undefined;
	};
}) => {
	const wh = new Webhook(process.env.AUTUMN_WEBHOOK_SECRET!);

	const { svixId, svixTimestamp, svixSignature } = headers;

	if (!svixId || !svixTimestamp || !svixSignature) {
		throw new RecaseError({
			message: "Error: Missing svix headers",
			code: ErrCode.InvalidInputs,
		});
	}

	try {
		const evt = wh.verify(rawBody, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		});
		return evt as { type: string; data: Record<string, unknown> };
	} catch (_err) {
		throw new RecaseError({
			message: "Error: Could not verify webhook",
			code: ErrCode.InvalidInputs,
		});
	}
};

autumnWebhookRouter.post("", async (c) => {
	try {
		const rawBody = await c.req.text();
		const evt = await verifyAutumnWebhook({
			rawBody,
			headers: {
				svixId: c.req.header("svix-id"),
				svixTimestamp: c.req.header("svix-timestamp"),
				svixSignature: c.req.header("svix-signature"),
			},
		});

		console.log("Received webhook from autumn");
		const { type, data } = evt;

		switch (type) {
			case WebhookEventType.CustomerProductsUpdated:
				console.log(
					`Type: ${type}, Scenario: ${data?.scenario}, Product: ${(data?.updated_product as { id?: string })?.id}`,
				);
				break;
			case WebhookEventType.CustomerThresholdReached:
				console.log(`Type: ${type}`);
				console.log(`Feature: `, data?.feature);
				break;
		}

		return c.json({ success: true, message: "Webhook received" }, 200);
	} catch (_error) {
		return c.json(
			{ success: false, message: "Error: Could not verify webhook" },
			200,
		);
	}
});
