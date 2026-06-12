import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("addon allocated v2: pro plus addon renews with held seats")}`,
	async () => {
		const customerId = "addon-allocated-v2-renewal";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const seatsAddon = products.recurringAddOn({
			id: "seats-addon",
			items: [items.allocatedV2Users({ includedUsage: 1 })],
		});

		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, seatsAddon] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: seatsAddon.id,
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});
		await timeout(2000);

		const customerAfterTrack =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterTrack,
			active: [pro.id, seatsAddon.id],
		});
		expectBalanceCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 3,
			planId: seatsAddon.id,
			nextResetAt: null,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: 60,
			latestInvoiceProductIds: [pro.id, seatsAddon.id],
		});
		const customerAfterRenewal =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 3,
			planId: seatsAddon.id,
			nextResetAt: null,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
