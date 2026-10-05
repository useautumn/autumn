/**
 * RevenueCat TRANSFER: a restore moves a purchase from rc user A to rc user B.
 * Autumn must move the existing customer product (same id, balances, period) to B,
 * leave both RC identity mappings alone, and never re-grant credits.
 *
 * The RC read client is served from mock fixtures describing the DESTINATION's
 * current subscriptions/purchases, so these tests never touch api.revenuecat.com.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
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
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	type RevenueCatMockFixtures,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_transfer";
const DAY_MS = 1000 * 60 * 60 * 24;

const rcPlan = ({ id, group }: { id: string; group?: string }) =>
	products.base({
		id,
		group,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

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

const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

const mapProduct = ({
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

const mockProduct = ({
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

const mockSubscription = ({
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

const getInternalCustomer = async (customerId: string) => {
	const customer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`customer ${customerId} not found`);
	return customer;
};

const listActiveCusProducts = async ({
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

const listActiveRcCusProducts = async ({
	customerId,
}: {
	customerId: string;
}) =>
	(await listActiveCusProducts({ customerId })).filter(
		(cusProduct) => cusProduct.processor?.type === ProcessorType.RevenueCat,
	);

const findActiveCusProduct = async ({
	customerId,
	autumnProductId,
}: {
	customerId: string;
	autumnProductId: string;
}) =>
	(await listActiveCusProducts({ customerId })).find(
		(cusProduct) => cusProduct.product.id === autumnProductId,
	);

const purchaseOnA = async ({
	plan,
	rcStoreId,
	rcInternalId,
	subId,
	customerId,
	extraMock,
}: {
	plan: ReturnType<typeof rcPlan>;
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

const cusProductMessagesBalance = ({
	cusProduct,
}: {
	cusProduct?: Awaited<ReturnType<typeof findActiveCusProduct>>;
}) =>
	cusProduct?.customer_entitlements.find(
		(cusEnt) => cusEnt.feature_id === TestFeature.Messages,
	)?.balance;

const setupCustomers = async ({
	customerId,
	plans,
}: {
	customerId: string;
	plans: ReturnType<typeof rcPlan>[];
}) => {
	await setupRevenueCatOrg();
	return initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.deleteCustomer({ customerId: `${customerId}-b` }),
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: plans }),
		],
		actions: [],
	});
};

test.concurrent(
	`${chalk.yellowBright("rc transfer: moves the product with its remaining balance, then B's renewal does not re-grant")}`,
	async () => {
		const customerA = "rc-xfer-main";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-main-pro" });
		const { autumnV2_3 } = await setupCustomers({
			customerId: customerA,
			plans: [plan],
		});

		const { cusProduct: before, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_main",
			rcInternalId: "prod_rc_xfer_main",
			subId: "sub_rc_xfer_main",
			customerId: customerA,
		});

		await autumnV2_3.track({
			customer_id: customerA,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		const beforeTransfer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerA);
		expect(beforeTransfer.balances[TestFeature.Messages]?.remaining).toBe(70);

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onB = await findActiveCusProduct({
			customerId: customerB,
			autumnProductId: plan.id,
		});
		expect(onB?.id).toBe(before.id);
		expect(onB?.processor?.id).toBe("sub_rc_xfer_main");
		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: plan.id,
			}),
		).toBeUndefined();
		expect(cusProductMessagesBalance({ cusProduct: onB })).toBe(70);

		expectWebhookSuccess(
			await newRcClient().renewal({
				productId: "com.app.rc_xfer_main",
				appUserId: customerB,
			}),
		);
		const afterRenewal = await listActiveRcCusProducts({
			customerId: customerB,
		});
		expect(afterRenewal.filter((cp) => cp.product.id === plan.id)).toHaveLength(
			1,
		);
		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: plan.id,
			}),
		).toBeUndefined();

		const a = await getInternalCustomer(customerA);
		const b = await getInternalCustomer(customerB);
		expect(a.processors?.revenuecat?.id).toBe(customerA);
		expect(b.processors?.revenuecat?.id).toBe(customerB);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: duplicate TRANSFER is a 200 no-op")}`,
	async () => {
		const customerA = "rc-xfer-dup";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-dup-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_dup",
			rcInternalId: "prod_rc_xfer_dup",
			subId: "sub_rc_xfer_dup",
			customerId: customerA,
		});

		for (let attempt = 0; attempt < 2; attempt++) {
			expectWebhookSuccess(
				await newRcClient().transfer({
					transferredFrom: [customerA],
					transferredTo: [customerB],
					mock,
				}),
			);
		}

		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onB.map((cp) => cp.id)).toEqual([cusProduct.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: same customer on both sides and unknown source are 200 no-ops")}`,
	async () => {
		const customerA = "rc-xfer-noop";
		const plan = rcPlan({ id: "rc-xfer-noop-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const { cusProduct, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_noop",
			rcInternalId: "prod_rc_xfer_noop",
			subId: "sub_rc_xfer_noop",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerA],
				mock,
			}),
		);
		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: ["$RCAnonymousID:nobody"],
				transferredTo: [customerA],
				mock,
			}),
		);

		const stillOnA = await findActiveCusProduct({
			customerId: customerA,
			autumnProductId: plan.id,
		});
		expect(stillOnA?.id).toBe(cusProduct.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: only purchases RC reports on the destination move")}`,
	async () => {
		const customerA = "rc-xfer-partial";
		const customerB = `${customerA}-b`;
		const moved = rcPlan({ id: "rc-xfer-partial-pro" });
		const stays = rcPlan({ id: "rc-xfer-partial-other", group: "other" });
		await setupCustomers({ customerId: customerA, plans: [moved, stays] });

		await purchaseOnA({
			plan: stays,
			rcStoreId: "com.app.rc_xfer_stays",
			rcInternalId: "prod_rc_xfer_stays",
			subId: "sub_rc_xfer_stays",
			customerId: customerA,
		});
		const { cusProduct: movedBefore, mock } = await purchaseOnA({
			plan: moved,
			rcStoreId: "com.app.rc_xfer_moved",
			rcInternalId: "prod_rc_xfer_moved",
			subId: "sub_rc_xfer_moved",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onA = await listActiveRcCusProducts({ customerId: customerA });
		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onA.map((cp) => cp.product.id)).toEqual([stays.id]);
		expect(onB.map((cp) => cp.id)).toEqual([movedBefore.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: replaces a different main plan the destination already has in the group")}`,
	async () => {
		const customerA = "rc-xfer-conflict";
		const customerB = `${customerA}-b`;
		const incoming = rcPlan({ id: "rc-xfer-conflict-pro" });
		const existing = rcPlan({ id: "rc-xfer-conflict-basic" });
		await setupCustomers({
			customerId: customerA,
			plans: [incoming, existing],
		});

		await purchaseOnA({
			plan: existing,
			rcStoreId: "com.app.rc_xfer_conflict_basic",
			rcInternalId: "prod_rc_xfer_conflict_basic",
			subId: "sub_rc_xfer_conflict_basic",
			customerId: customerB,
		});
		const { cusProduct, mock } = await purchaseOnA({
			plan: incoming,
			rcStoreId: "com.app.rc_xfer_conflict_pro",
			rcInternalId: "prod_rc_xfer_conflict_pro",
			subId: "sub_rc_xfer_conflict_pro",
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onB.map((cp) => cp.id)).toEqual([cusProduct.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc transfer: leaves the source product when the destination already has the same plan")}`,
	async () => {
		const customerA = "rc-xfer-same";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: "rc-xfer-same-pro" });
		await setupCustomers({ customerId: customerA, plans: [plan] });

		const { cusProduct: onAFirst, mock } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_same",
			rcInternalId: "prod_rc_xfer_same",
			subId: "sub_rc_xfer_same_a",
			customerId: customerA,
		});
		const { cusProduct: onBFirst } = await purchaseOnA({
			plan,
			rcStoreId: "com.app.rc_xfer_same",
			rcInternalId: "prod_rc_xfer_same",
			subId: "sub_rc_xfer_same_b",
			customerId: customerB,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onA = await listActiveRcCusProducts({ customerId: customerA });
		const onB = await listActiveRcCusProducts({ customerId: customerB });
		expect(onA.map((cp) => cp.id)).toEqual([onAFirst.id]);
		expect(onB.map((cp) => cp.id)).toEqual([onBFirst.id]);
	},
);
