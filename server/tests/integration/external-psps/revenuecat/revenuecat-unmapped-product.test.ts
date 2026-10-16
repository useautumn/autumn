import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import { RevenueCatWebhookClient } from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret ===
		RC_WEBHOOK_SECRET
	)
		return;

	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			processor_configs: {
				...ctx.org.processor_configs,
				revenuecat: {
					api_key: encryptData("mock_rc_api_key_live"),
					sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
					project_id: "mock_project_live",
					sandbox_project_id: "mock_project_sandbox",
					webhook_secret: RC_WEBHOOK_SECRET,
					sandbox_webhook_secret: RC_WEBHOOK_SECRET,
				},
			},
		},
	});
};

test(`${chalk.yellowBright("revenuecat unmapped product: webhook returns the 404 reason, not a 500")}`, async () => {
	const unmappedProductId = "com.app.rc_unmapped_product";

	await setupRevenueCatOrg();

	const rcClient = new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

	const { response, data } = await rcClient.renewal({
		productId: unmappedProductId,
		appUserId: "rc-unmapped-product-user",
	});

	expect(response.status).toBe(404);
	expect(data).toMatchObject({
		code: ErrCode.ProductNotFound,
		message: expect.stringContaining(unmappedProductId),
	});
});
