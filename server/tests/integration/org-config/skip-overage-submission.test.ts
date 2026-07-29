import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { OrgService } from "@/internal/orgs/OrgService";
import { expectCustomerFeatureCorrect } from "../billing/utils/expectCustomerFeatureCorrect";

const runOverageRenewal = async ({
	customerId,
	orgDisableOverageBilling,
	customerDisableOverageBilling,
	expectedLatestTotal,
}: {
	customerId: string;
	orgDisableOverageBilling: boolean;
	customerDisableOverageBilling?: boolean;
	expectedLatestTotal: number;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});

	const { ctx, autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({
				paymentMethod: "success",
				data: {
					config:
						customerDisableOverageBilling === undefined
							? undefined
							: {
									disable_overage_billing:
										customerDisableOverageBilling,
								},
				},
			}),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});
	const originalConfig = ctx.org.config;

	try {
		await OrgService.update({
			db,
			orgId: ctx.org.id,
			updates: {
				config: {
					...ctx.org.config,
					disable_overage_billing: orgDisableOverageBilling,
				},
			},
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});
		await timeout(2000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: expectedLatestTotal,
			latestInvoiceProductId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
		expect(customerAfterRenewal.features[TestFeature.Messages].balance).toBe(100);
	} finally {
		await OrgService.update({
			db,
			orgId: ctx.org.id,
			updates: { config: originalConfig },
		});
	}
};

test(`${chalk.yellowBright("disable overage billing: org field skips Stripe overage and resets")}`, async () => {
	await runOverageRenewal({
		customerId: "disable-overage-org",
		orgDisableOverageBilling: true,
		expectedLatestTotal: 20,
	});
});

test(`${chalk.yellowBright("disable overage billing: customer true skips Stripe overage and resets")}`, async () => {
	await runOverageRenewal({
		customerId: "disable-overage-customer-true",
		orgDisableOverageBilling: false,
		customerDisableOverageBilling: true,
		expectedLatestTotal: 20,
	});
});

test(`${chalk.yellowBright("disable overage billing: customer false overrides org true")}`, async () => {
	await runOverageRenewal({
		customerId: "disable-overage-customer-false",
		orgDisableOverageBilling: true,
		customerDisableOverageBilling: false,
		expectedLatestTotal: 30,
	});
});
