import { test } from "bun:test";
import { type ApiCustomerV5, autoTopupLimitStates } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer.js";

const AUTO_TOPUP_WAIT_MS = 30000;

const MAX_CONSECUTIVE_FAILURES = 3;

const expireAutoTopupWindows = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const expired = Date.now() - 1;

	await ctx.db
		.update(autoTopupLimitStates)
		.set({
			attempt_window_ends_at: expired,
			attempt_count: 0,
			failed_attempt_window_ends_at: expired,
			failed_attempt_count: 0,
		})
		.where(
			and(
				eq(autoTopupLimitStates.org_id, ctx.org.id),
				eq(autoTopupLimitStates.env, ctx.env),
				eq(autoTopupLimitStates.customer_id, customerId),
				eq(autoTopupLimitStates.feature_id, featureId),
			),
		);
};

const swapCard = async ({
	ctx,
	customerId,
	type,
}: {
	ctx: TestContext;
	customerId: string;
	type: "success" | "fail";
}) => {
	const persistedCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeCusId = persistedCustomer?.processor?.id;
	if (!stripeCusId) {
		throw new Error(`No Stripe customer id for ${customerId}`);
	}

	const existing = await ctx.stripeCli.paymentMethods.list({
		customer: stripeCusId,
	});

	for (const paymentMethod of existing.data) {
		await ctx.stripeCli.paymentMethods.detach(paymentMethod.id);
	}

	await attachPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeCusId,
		type,
	});
};

const setupDecliningCustomer = async ({ id }: { id: string }) => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prod = products.base({
		id: `topup-${id}`,
		items: [oneOffItem],
	});

	const scenario = await initScenario({
		customerId: `auto-topup-${id}`,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	await scenario.autumnV2_1.customers.update(scenario.customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
		}),
	});

	return scenario;
};

test.concurrent(
	`${chalk.yellowBright("auto-topup susp1: breaker trips after 3 consecutive failures and survives window expiry")}`,
	async () => {
		const { customerId, autumnV2_1, ctx } = await setupDecliningCustomer({
			id: "susp1",
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestStatus: "void",
		});

		for (let attempt = 2; attempt <= MAX_CONSECUTIVE_FAILURES; attempt++) {
			await expireAutoTopupWindows({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});

			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			});
			await timeout(AUTO_TOPUP_WAIT_MS);

			await expectCustomerInvoiceCorrect({
				customerId,
				count: attempt + 1,
				latestStatus: "void",
			});
		}

		const invoiceCountAtSuspension = MAX_CONSECUTIVE_FAILURES + 1;

		await expireAutoTopupWindows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoiceCountAtSuspension,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup susp2: re-attaching the same declining card does not resume top-ups")}`,
	async () => {
		const { customerId, autumnV2_1, ctx } = await setupDecliningCustomer({
			id: "susp2",
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		for (let attempt = 2; attempt <= MAX_CONSECUTIVE_FAILURES; attempt++) {
			await expireAutoTopupWindows({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});

			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			});
			await timeout(AUTO_TOPUP_WAIT_MS);
		}

		const invoiceCountAtSuspension = MAX_CONSECUTIVE_FAILURES + 1;
		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoiceCountAtSuspension,
		});

		await swapCard({ ctx, customerId, type: "fail" });

		await expireAutoTopupWindows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoiceCountAtSuspension,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup susp3: attaching a working card resumes top-ups")}`,
	async () => {
		const { customerId, autumnV2_1, ctx } = await setupDecliningCustomer({
			id: "susp3",
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 85,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		for (let attempt = 2; attempt <= MAX_CONSECUTIVE_FAILURES; attempt++) {
			await expireAutoTopupWindows({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});

			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			});
			await timeout(AUTO_TOPUP_WAIT_MS);
		}

		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const remainingBeforeFix =
			before.balances[TestFeature.Messages].remaining ?? 0;

		await swapCard({ ctx, customerId, type: "success" });

		await expireAutoTopupWindows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: remainingBeforeFix - 1 + 100,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: MAX_CONSECUTIVE_FAILURES + 2,
			latestTotal: 10,
			latestStatus: "paid",
		});
	},
);
