import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { db } from "@/db/initDrizzle";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";


test(
	`${chalk.yellowBright("trial-revert-expiry 1: cron expires trial and unpauses previous plan")}`,
	async () => {
		const customerId = "trial-revert-expiry-basic";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCusProduct = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const pausedCusProduct = beforeCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(trialCusProduct).toBeDefined();
		expect(pausedCusProduct).toBeDefined();
		expect(trialCusProduct!.status).toBe(CusProductStatus.Active);
		expect(pausedCusProduct!.status).toBe(CusProductStatus.Paused);

		const proSubscriptionIds = pausedCusProduct!.subscription_ids;

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCusProduct!.id));

		await runProductCron({ ctx: { db, logger } });

		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const expiredTrialCp = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const restoredProCp = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(expiredTrialCp).toBeDefined();
		expect(restoredProCp).toBeDefined();

		expect(expiredTrialCp!.status).toBe(CusProductStatus.Expired);

		expect(restoredProCp!.status).toBe(CusProductStatus.Active);
		expect(restoredProCp!.canceled).toBe(false);
		expect(restoredProCp!.ended_at).toBeNull();

		expect(restoredProCp!.subscription_ids).toEqual(proSubscriptionIds);
	},
);

test(
	`${chalk.yellowBright("trial-revert-expiry 2: non-revert trial expires normally (regression)")}`,
	async () => {
		const customerId = "trial-revert-expiry-regression";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [freeMessages],
		});

		const trialMessages = items.monthlyMessages({ includedUsage: 500 });
		const trialProduct = products.baseWithTrial({
			id: "trial-product",
			items: [trialMessages],
			trialDays: 7,
			cardRequired: false,
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free, trialProduct] }),
			],
			actions: [s.billing.attach({ productId: trialProduct.id })],
		});

		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCp = beforeCron.customer_products.find(
			(cp) => cp.product_id === trialProduct.id,
		);
		expect(trialCp).toBeDefined();
		expect(trialCp!.on_trial_end).toBeNull();

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCp!.id));

		await runProductCron({ ctx: { db, logger } });

		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const expiredTrialCp = afterCron.customer_products.find(
			(cp) => cp.product_id === trialProduct.id,
		);
		const defaultCp = afterCron.customer_products.find(
			(cp) => cp.product_id === free.id,
		);

		expect(expiredTrialCp).toBeDefined();
		expect(expiredTrialCp!.status).toBe(CusProductStatus.Expired);

		expect(defaultCp).toBeDefined();
		expect(defaultCp!.status).toBe(CusProductStatus.Active);
	},
);

test(
	`${chalk.yellowBright("trial-revert-expiry 3: revert does NOT activate free default")}`,
	async () => {
		const customerId = "trial-revert-expiry-no-default";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCp = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		expect(trialCp).toBeDefined();

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialCp!.id));

		await runProductCron({ ctx: { db, logger } });

		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const restoredPro = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const expiredEnterprise = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const freeDefault = afterCron.customer_products.find(
			(cp) => cp.product_id === free.id,
		);

		expect(restoredPro).toBeDefined();
		expect(restoredPro!.status).toBe(CusProductStatus.Active);

		expect(expiredEnterprise).toBeDefined();
		expect(expiredEnterprise!.status).toBe(CusProductStatus.Expired);

		expect(freeDefault).toBeUndefined();
	},
);

test(
	`${chalk.yellowBright("trial-revert-expiry 4: skips restore if previous plan expired during trial")}`,
	async () => {
		const customerId = "trial-revert-expiry-expired-prev";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const pausedPro = beforeCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		const trialEnterprise = beforeCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);

		expect(pausedPro).toBeDefined();
		expect(pausedPro!.status).toBe(CusProductStatus.Paused);
		expect(trialEnterprise).toBeDefined();

		await db
			.update(customerProducts)
			.set({ status: CusProductStatus.Expired })
			.where(eq(customerProducts.id, pausedPro!.id));

		const pastTrialEnd = Date.now() - 60_000;
		await db
			.update(customerProducts)
			.set({ trial_ends_at: pastTrialEnd })
			.where(eq(customerProducts.id, trialEnterprise!.id));

		await runProductCron({ ctx: { db, logger } });

		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const expiredEnterprise = afterCron.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const expiredPro = afterCron.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(expiredEnterprise).toBeDefined();
		expect(expiredEnterprise!.status).toBe(CusProductStatus.Expired);

		expect(expiredPro).toBeDefined();
		expect(expiredPro!.status).toBe(CusProductStatus.Expired);
	},
);

test(
	`${chalk.yellowBright("trial-revert-expiry 5: cancel trial immediately unpauses previous plan")}`,
	async () => {
		const customerId = "trial-revert-cancel-unpause";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const beforeCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const trialCp = beforeCancel.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const pausedCp = beforeCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(trialCp).toBeDefined();
		expect(trialCp!.status).toBe(CusProductStatus.Active);
		expect(trialCp!.on_trial_end).toBe("revert");
		expect(pausedCp).toBeDefined();
		expect(pausedCp!.status).toBe(CusProductStatus.Paused);

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: enterprise.id,
				cancel_action: "cancel_immediately" as const,
			},
			{ timeout: 2000 },
		);

		const afterCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const cancelledEnterprise = afterCancel.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const restoredPro = afterCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(cancelledEnterprise).toBeDefined();
		expect(cancelledEnterprise!.status).toBe(CusProductStatus.Expired);

		expect(restoredPro).toBeDefined();
		expect(restoredPro!.status).toBe(CusProductStatus.Active);
	},
);

test(
	`${chalk.yellowBright("trial-revert-expiry 6: cancel trial does not restore expired previous plan")}`,
	async () => {
		const customerId = "trial-revert-cancel-expired-prev";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [proMessages] });

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(params);

		const beforeCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const pausedPro = beforeCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		expect(pausedPro).toBeDefined();
		expect(pausedPro!.status).toBe(CusProductStatus.Paused);

		await db
			.update(customerProducts)
			.set({ status: CusProductStatus.Expired })
			.where(eq(customerProducts.id, pausedPro!.id));

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: enterprise.id,
				cancel_action: "cancel_immediately" as const,
			},
			{ timeout: 2000 },
		);

		const afterCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const cancelledEnterprise = afterCancel.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);
		const expiredPro = afterCancel.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);

		expect(cancelledEnterprise).toBeDefined();
		expect(cancelledEnterprise!.status).toBe(CusProductStatus.Expired);

		expect(expiredPro).toBeDefined();
		expect(expiredPro!.status).toBe(CusProductStatus.Expired);
	},
);

