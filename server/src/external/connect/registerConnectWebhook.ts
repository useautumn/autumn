import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { WEBHOOK_EVENTS } from "@/utils/constants.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { initPlatformStripe } from "./initStripeCli.js";

export const registerConnectWebhook = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const { db, org, env, logger } = ctx;
	// Init master stripe
	const stripeCli = initPlatformStripe({ masterOrg: org, env });

	const curWebhookEndpoints = await stripeCli.webhookEndpoints.list();
	const backendUrl = process.env.SERVER_URL || process.env.STRIPE_WEBHOOK_URL;

	const webhookUrl = `${backendUrl}/webhooks/connect/${env}?org_id=${org.id}`;

	if (curWebhookEndpoints.data.some((webhook) => webhook.url === webhookUrl))
		return;

	const webhook = await stripeCli.webhookEndpoints.create({
		url: webhookUrl,
		enabled_events:
			WEBHOOK_EVENTS as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
		connect: true,
	});

	logger.info(`Registered connect webhook for ${org.slug} ${env}`);

	await OrgService.updateConnectWebhookSecret({
		db,
		orgId: org.id,
		env,
		secret: encryptData(webhook.secret as string),
	});

	logger.info(`Updated connect webhook secret for ${org.slug} ${env}`);

	return webhook;
};
