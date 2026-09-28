import { AppEnv, CusProductStatus, customers } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import { RevenueCatWebhookClient } from "./revenue-cat-webhook-client";

export const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_period";
export const DAY_MS = 1000 * 60 * 60 * 24;

export const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret ===
		RC_WEBHOOK_SECRET
	) {
		return;
	}

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

export const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

export const setupRcProduct = async ({
	customerId,
	productId,
	storeId,
}: {
	customerId: string;
	productId: string;
	storeId: string;
}) => {
	const proMonthly = products.base({
		id: productId,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

	await setupRevenueCatOrg();

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [proMonthly] }),
		],
		actions: [],
	});

	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: proMonthly.id,
			revenuecat_product_ids: [storeId],
		},
	});

	return { autumnV2_2, proMonthly };
};

export const getRcCusProduct = async ({
	customerId,
	autumnProductId,
}: {
	customerId: string;
	autumnProductId: string;
}) => {
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!dbCustomer) return undefined;

	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: dbCustomer.internal_id,
		inStatuses: [CusProductStatus.Active],
	});
	return cusProducts.find((cp) => cp.product.id === autumnProductId);
};

export const pollUntil = async <T>(
	fn: () => Promise<T>,
	predicate: (value: T) => boolean,
	{ timeoutMs = 8000, intervalMs = 200 } = {},
): Promise<T> => {
	const start = Date.now();
	let last = await fn();
	while (!predicate(last) && Date.now() - start < timeoutMs) {
		await new Promise((r) => setTimeout(r, intervalMs));
		last = await fn();
	}
	return last;
};
