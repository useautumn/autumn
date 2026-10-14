import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	AppEnv,
	CusProductStatus,
	customers,
} from "@autumn/shared";
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
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_dualkey";

const rcProMonthly = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
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
	}
};

const newRcClient = () =>
	new RevenueCatWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		webhookSecret: RC_WEBHOOK_SECRET,
	});

const mapProduct = async ({
	autumnProductId,
	revenuecatProductId,
}: {
	autumnProductId: string;
	revenuecatProductId: string;
}) => {
	await RCMappingService.upsert({
		db: ctx.db,
		data: {
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			autumn_product_id: autumnProductId,
			revenuecat_product_ids: [revenuecatProductId],
		},
	});
};

const seedProcessorsRevenueCatId = async ({
	customerId,
	revenueCatId,
	aliases = [],
}: {
	customerId: string;
	revenueCatId: string;
	aliases?: string[];
}) => {
	await ctx.db
		.update(customers)
		.set({ processors: { revenuecat: { id: revenueCatId, aliases } } })
		.where(eq(customers.id, customerId));
};

const getCustomerByCustomerId = async (customerId: string) =>
	ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});

const activeRcProductIds = async (internalCustomerId: string) => {
	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	return cusProducts.map((cp) => cp.product.id);
};

const pollUntil = async <T>(
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

test.concurrent(
	`${chalk.yellowBright("rc dual-key: resolves customer by processors.revenuecat.id when it differs from customer_id")}`,
	async () => {
		const customerId = "rc-dualkey-cus";
		const appUserId = "rc-dualkey-appuser";
		const RC_PRODUCT_ID = "com.app.rc_dualkey_pro";
		const proMonthly = rcProMonthly({ id: "rc-dualkey-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: appUserId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});
		await seedProcessorsRevenueCatId({ customerId, revenueCatId: appUserId });

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId,
				originalTransactionId: "rc_dualkey_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();

		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		const strayCustomer = await getCustomerByCustomerId(appUserId);
		expect(strayCustomer).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: falls back to customer_id when no processors key (backward compat)")}`,
	async () => {
		const customerId = "rc-dualkey-compat";
		const RC_PRODUCT_ID = "com.app.rc_dualkey_compat_pro";
		const proMonthly = rcProMonthly({ id: "rc-dualkey-compat-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: customerId,
				originalTransactionId: "rc_dualkey_compat_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: matches seeded anon id via original_app_user_id after alias")}`,
	async () => {
		const customerId = "rc-alias-cus";
		const anonId = "rc-alias-anon";
		const realId = "rc-alias-real";
		const RC_PRODUCT_ID = "com.app.rc_alias_pro";
		const proMonthly = rcProMonthly({ id: "rc-alias-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: anonId }),
				s.deleteCustomer({ customerId: realId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});
		await seedProcessorsRevenueCatId({ customerId, revenueCatId: anonId });

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: realId,
				originalAppUserId: anonId,
				originalTransactionId: "rc_alias_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		const after = await pollUntil(
			() => getCustomerByCustomerId(customerId),
			(c) => Boolean(c?.processors?.revenuecat?.aliases?.includes(realId)),
		);
		expect(after?.processors?.revenuecat?.id).toBe(anonId);
		expect(after?.processors?.revenuecat?.aliases).toContain(realId);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: lazily backfills processors.revenuecat.id (only-if-absent, no clobber)")}`,
	async () => {
		const customerId = "rc-backfill-cus";
		const RC_PRODUCT_ID = "com.app.rc_backfill_pro";
		const proMonthly = rcProMonthly({ id: "rc-backfill-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});

		const before = await getCustomerByCustomerId(customerId);
		expect(before?.processors?.revenuecat).toBeUndefined();

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: customerId,
				originalTransactionId: "rc_backfill_tx_001",
			}),
		);

		const afterFirst = await pollUntil(
			() => getCustomerByCustomerId(customerId),
			(c) => c?.processors?.revenuecat?.id === customerId,
		);
		expect(afterFirst?.processors?.revenuecat?.id).toBe(customerId);
		expect(afterFirst?.processors?.revenuecat?.aliases).toEqual([]);

		expectWebhookSuccess(
			await newRcClient().renewal({
				productId: RC_PRODUCT_ID,
				appUserId: "rc-backfill-aliased",
				originalAppUserId: customerId,
				originalTransactionId: "rc_backfill_tx_001",
			}),
		);

		const afterSecond = await pollUntil(
			() => getCustomerByCustomerId(customerId),
			(c) =>
				Boolean(
					c?.processors?.revenuecat?.aliases?.includes("rc-backfill-aliased"),
				),
		);
		expect(afterSecond?.processors?.revenuecat?.id).toBe(customerId);
		expect(afterSecond?.processors?.revenuecat?.aliases).toContain(
			"rc-backfill-aliased",
		);

		expectWebhookSuccess(
			await newRcClient().renewal({
				productId: RC_PRODUCT_ID,
				appUserId: "rc-backfill-aliased",
				originalAppUserId: customerId,
				originalTransactionId: "rc_backfill_tx_001",
			}),
		);
		await new Promise((r) => setTimeout(r, 1500));
		const afterRepeat = await getCustomerByCustomerId(customerId);
		expect(afterRepeat?.processors?.revenuecat?.id).toBe(customerId);
		const aliasOccurrences =
			afterRepeat?.processors?.revenuecat?.aliases?.filter(
				(a) => a === "rc-backfill-aliased",
			) ?? [];
		expect(aliasOccurrences).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: auto-creates email app_user_id with non-email customer id")}`,
	async () => {
		const email = "rc-email-user@example.com";
		const RC_PRODUCT_ID = "com.app.rc_email_pro";
		const proMonthly = rcProMonthly({ id: "rc-email-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId: "rc-email-anchor",
			setup: [
				s.deleteCustomer({ customerId: "rc-email-anchor" }),
				s.deleteCustomer({ customerId: email }),
				s.deleteCustomer({ email }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: email,
				originalTransactionId: "rc_email_tx_001",
			}),
		);

		const created = await pollUntil(
			() =>
				ctx.db.query.customers.findFirst({
					where: eq(customers.email, email),
				}),
			(c) => Boolean(c?.processors?.revenuecat?.id),
		);

		expect(created).toBeTruthy();
		expect(created?.id).not.toBe(email);
		expect(created?.email).toBe(email);
		expect(created?.processors?.revenuecat?.id).toBe(email);

		const productIds = await activeRcProductIds(created!.internal_id);
		expect(productIds).toContain(proMonthly.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: getCusProcessors omits revenuecat when no active RC product (invariant)")}`,
	async () => {
		const customerId = "rc-invariant-cus";
		const proMonthly = rcProMonthly({ id: "rc-invariant-pro" });

		await setupRevenueCatOrg();

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await seedProcessorsRevenueCatId({
			customerId,
			revenueCatId: "rc-invariant-appuser",
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(customer.processors?.revenuecat).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc dual-key: resolves customer when app_user_id is in aliases (not the primary id)")}`,
	async () => {
		const customerId = "rc-aliasset-cus";
		const primaryId = "rc-aliasset-primary";
		const aliasId = "rc-aliasset-alias";
		const RC_PRODUCT_ID = "com.app.rc_aliasset_pro";
		const proMonthly = rcProMonthly({ id: "rc-aliasset-pro" });

		await setupRevenueCatOrg();

		await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.deleteCustomer({ customerId: primaryId }),
				s.deleteCustomer({ customerId: aliasId }),
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await mapProduct({
			autumnProductId: proMonthly.id,
			revenuecatProductId: RC_PRODUCT_ID,
		});
		await seedProcessorsRevenueCatId({
			customerId,
			revenueCatId: primaryId,
			aliases: [aliasId],
		});

		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: RC_PRODUCT_ID,
				appUserId: aliasId,
				originalTransactionId: "rc_aliasset_tx_001",
			}),
		);

		const dbCustomer = await getCustomerByCustomerId(customerId);
		expect(dbCustomer).toBeTruthy();
		const productIds = await pollUntil(
			() => activeRcProductIds(dbCustomer!.internal_id),
			(ids) => ids.includes(proMonthly.id),
		);
		expect(productIds).toContain(proMonthly.id);

		const strayCustomer = await getCustomerByCustomerId(aliasId);
		expect(strayCustomer).toBeUndefined();
		const after = await getCustomerByCustomerId(customerId);
		expect(after?.processors?.revenuecat?.id).toBe(primaryId);
		expect(after?.processors?.revenuecat?.aliases).toEqual([aliasId]);
	},
);
