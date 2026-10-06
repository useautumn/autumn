/**
 * No-card trials attached in invoice mode, at trial end (product cron, driven by the test clock).
 *
 * Contract:
 *  - no card → one send_invoice Stripe sub, its invoice open for the plan price and unpaid,
 *    plan active and no longer trialing
 *  - a card added during the trial is never charged: the trial still converts by invoice
 *  - two entities on the same invoiced trial convert into one send_invoice sub
 *  - canceled during the trial → expires to the free default, no sub
 *  - email removed before trial end → can't be invoiced, expires to the free default, no sub
 *  - a mid-trial update keeps the invoice intent, and the trial still converts by invoice
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	CollectionMethod,
	customers,
	FreeTrialDuration,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	expectTrialCollectionMethod,
	expectTrialInvoicedCorrect,
} from "@tests/integration/billing/attach/free-trial/no-card/utils/expectInvoicedTrialCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const TRIAL_DAYS = 7;
const EXTENDED_TRIAL_DAYS = 14;
const DAYS_PAST_TRIAL_END = TRIAL_DAYS + 1;
const PRO_PRICE = 20;

const noCardProTrial = () =>
	products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: TRIAL_DAYS,
		cardRequired: false,
	});

const freeDefault = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});

const expectConvertedByInvoice = async ({
	ctx,
	customerId,
	autumnV1,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	productId: string;
}) => {
	await expectProductActive({ customerId, autumn: autumnV1, productId });
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({ customer, productId });
	await expectTrialInvoicedCorrect({
		ctx,
		customerId,
		latestTotal: PRO_PRICE,
	});
};

const removeCustomerEmail = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await ctx.db
		.update(customers)
		.set({ email: null })
		.where(eq(customers.internal_id, customer?.internal_id ?? ""));
	await ctx.stripeCli.customers.update(customer?.processor?.id ?? "", {
		email: "",
	});
	await deleteCachedFullCustomer({ ctx, customerId });
};

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 1: no card → invoiced into a send_invoice sub")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "no-card-inv-end-convert",
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [
				s.billing.attach({ productId: proTrial.id, invoice: true }),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		await expectConvertedByInvoice({
			ctx,
			customerId,
			autumnV1,
			productId: proTrial.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 2: card added mid-trial is not charged")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "no-card-inv-end-card",
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [
				s.billing.attach({ productId: proTrial.id, invoice: true }),
				s.attachPaymentMethod({ type: "success" }),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		await expectConvertedByInvoice({
			ctx,
			customerId,
			autumnV1,
			productId: proTrial.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 3: entities convert into one send_invoice sub")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "no-card-inv-end-entities",
			setup: [
				s.customer({}),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: proTrial.id,
					entityIndex: 0,
					invoice: true,
				}),
				s.billing.attach({
					productId: proTrial.id,
					entityIndex: 1,
					invoice: true,
				}),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		for (const entity of entities) {
			const customerEntity = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			await expectProductActive({
				customer: customerEntity,
				productId: proTrial.id,
			});
			await expectProductNotTrialing({
				customer: customerEntity,
				productId: proTrial.id,
			});
		}
		await expectTrialInvoicedCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 4: canceled mid-trial → expires to the free default")}`,
	async () => {
		const proTrial = noCardProTrial();
		const free = freeDefault();

		const { customerId, autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
				customerId: "no-card-inv-end-cancel",
				setup: [s.customer({}), s.products({ list: [proTrial, free] })],
				actions: [s.billing.attach({ productId: proTrial.id, invoice: true })],
			});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: DAYS_PAST_TRIAL_END,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [free.id],
			notPresent: [proTrial.id],
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 5: email removed before trial end → expires")}`,
	async () => {
		const proTrial = noCardProTrial();
		const free = freeDefault();

		const { customerId, autumnV1, ctx, testClockId } = await initScenario({
			customerId: "no-card-inv-end-no-email",
			setup: [s.customer({}), s.products({ list: [proTrial, free] })],
			actions: [s.billing.attach({ productId: proTrial.id, invoice: true })],
		});

		await removeCustomerEmail({ ctx, customerId });

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: DAYS_PAST_TRIAL_END,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [free.id],
			notPresent: [proTrial.id],
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-invoice-end 6: mid-trial update keeps the invoice intent")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
				customerId: "no-card-inv-end-update",
				setup: [s.customer({}), s.products({ list: [proTrial] })],
				actions: [s.billing.attach({ productId: proTrial.id, invoice: true })],
			});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: proTrial.id,
			customize: {
				free_trial: {
					duration_length: EXTENDED_TRIAL_DAYS,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
				},
			},
		});
		await expectTrialCollectionMethod({
			ctx,
			customerId,
			productId: proTrial.id,
			collectionMethod: CollectionMethod.SendInvoice,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: EXTENDED_TRIAL_DAYS + 1,
		});

		await expectConvertedByInvoice({
			ctx,
			customerId,
			autumnV1,
			productId: proTrial.id,
		});
	},
);
