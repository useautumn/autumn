import { expect } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	customers,
	ProcessorType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	type RevenueCatMockFixtures,
	RevenueCatWebhookClient,
} from "./revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_transfer";
const DAY_MS = 1000 * 60 * 60 * 24;

export const rcPlan = ({ id, group }: { id: string; group?: string }) =>
	products.base({
		id,
		group,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

export const setupRevenueCatOrg = async () => {
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

export const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

export const mapProduct = ({
	autumnProductId,
	revenuecatProductId,
}: {
	autumnProductId: string;
	revenuecatProductId: string;
}) =>
	RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: autumnProductId,
			revenuecat_product_ids: [revenuecatProductId],
		},
	});

export const mockProduct = ({
	internalId,
	storeId,
}: {
	internalId: string;
	storeId: string;
}) => ({
	object: "product",
	id: internalId,
	store_identifier: storeId,
	type: "subscription",
	created_at: Date.now(),
	app_id: "app_mock",
	display_name: storeId,
});

export const mockSubscription = ({
	id,
	internalProductId,
}: {
	id: string;
	internalProductId: string;
}) => ({
	object: "subscription",
	id,
	product_id: internalProductId,
	store: "app_store",
	store_subscription_identifier: `store_${id}`,
	status: "active",
	starts_at: Date.now(),
	current_period_starts_at: Date.now(),
	current_period_ends_at: Date.now() + 30 * DAY_MS,
	auto_renewal_status: "will_renew",
	gives_access: true,
});

export const getInternalCustomer = async (customerId: string) => {
	const customer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`customer ${customerId} not found`);
	return customer;
};

export const listActiveCusProducts = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { internal_id } = await getInternalCustomer(customerId);
	return CusProductService.list({
		db: ctx.db,
		internalCustomerId: internal_id,
		inStatuses: [CusProductStatus.Active],
	});
};

export const listActiveRcCusProducts = async ({
	customerId,
}: {
	customerId: string;
}) =>
	(await listActiveCusProducts({ customerId })).filter(
		(cusProduct) => cusProduct.processor?.type === ProcessorType.RevenueCat,
	);

export const findActiveCusProduct = async ({
	customerId,
	autumnProductId,
}: {
	customerId: string;
	autumnProductId: string;
}) =>
	(await listActiveCusProducts({ customerId })).find(
		(cusProduct) => cusProduct.product.id === autumnProductId,
	);

export const purchaseOnA = async ({
	plan,
	rcStoreId,
	rcInternalId,
	subId,
	customerId,
	extraMock,
}: {
	plan: { id: string };
	rcStoreId: string;
	rcInternalId: string;
	subId: string;
	customerId: string;
	extraMock?: RevenueCatMockFixtures;
}) => {
	await mapProduct({
		autumnProductId: plan.id,
		revenuecatProductId: rcStoreId,
	});
	const mock: RevenueCatMockFixtures = {
		products: [
			mockProduct({ internalId: rcInternalId, storeId: rcStoreId }),
			...(extraMock?.products ?? []),
		],
		subscriptions: [
			mockSubscription({ id: subId, internalProductId: rcInternalId }),
		],
		purchases: [],
	};
	expectWebhookSuccess(
		await newRcClient().initialPurchase({
			productId: rcStoreId,
			appUserId: customerId,
			originalTransactionId: `tx_${subId}`,
			mock,
		}),
	);
	const cusProduct = await pollUntilDefined(() =>
		findProcessorIdProduct({ customerId, autumnProductId: plan.id }),
	);
	expect(cusProduct.processor?.id).toBe(subId);
	return { cusProduct, mock };
};

const findProcessorIdProduct = async ({
	customerId,
	autumnProductId,
}: {
	customerId: string;
	autumnProductId: string;
}) => {
	const cusProduct = await findActiveCusProduct({
		customerId,
		autumnProductId,
	});
	return cusProduct?.processor?.id ? cusProduct : undefined;
};

const pollUntilDefined = async <T>(
	fn: () => Promise<T | undefined>,
	timeoutMs = 8000,
): Promise<T> => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const value = await fn();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error("timed out waiting for condition");
};

export const cusProductMessagesBalance = ({
	cusProduct,
}: {
	cusProduct?: Awaited<ReturnType<typeof findActiveCusProduct>>;
}) =>
	cusProduct?.customer_entitlements.find(
		(cusEnt) => cusEnt.feature_id === TestFeature.Messages,
	)?.balance;

export const setupCustomers = async ({
	customerId,
	plans,
	entityCount = 0,
	actions = [],
}: {
	customerId: string;
	plans: ReturnType<typeof rcPlan>[];
	entityCount?: number;
	actions?: Parameters<typeof initScenario>[0]["actions"];
}) => {
	await setupRevenueCatOrg();
	return initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.deleteCustomer({ customerId: `${customerId}-b` }),
			s.customer({ testClock: false, skipWebhooks: true }),
			...(entityCount > 0
				? [s.entities({ count: entityCount, featureId: TestFeature.Users })]
				: []),
			s.products({ list: plans }),
		],
		actions,
	});
};
