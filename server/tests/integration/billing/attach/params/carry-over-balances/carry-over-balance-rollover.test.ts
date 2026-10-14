import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type FullCustomer,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService";

const getMessagesCustomerEntitlements = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer: FullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const planCustomerEntitlement = fullCustomer.customer_products
		.flatMap((customerProduct) => customerProduct.customer_entitlements)
		.find(
			(customerEntitlement) =>
				customerEntitlement.entitlement.feature.id === TestFeature.Messages,
		);

	const carriedOverCustomerEntitlements =
		fullCustomer.extra_customer_entitlements.filter(
			(customerEntitlement) =>
				customerEntitlement.entitlement.feature.id === TestFeature.Messages,
		);

	return { planCustomerEntitlement, carriedOverCustomerEntitlements };
};

test.concurrent(
	`${chalk.yellowBright("carry-over-balance rollover 1: forever rollover item carries balance with no expiry")}`,
	async () => {
		const foreverRollover = {
			max: null,
			length: 1,
			duration: RolloverExpiryDurationType.Forever,
		};
		const proMessages = items.monthlyMessagesWithRollover({
			includedUsage: 100,
			rolloverConfig: foreverRollover,
		});
		const premiumMessages = items.monthlyMessagesWithRollover({
			includedUsage: 500,
			rolloverConfig: foreverRollover,
		});

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId: "carry-over-balance-rollover-forever",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
			],
		});

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			plan_schedule: "immediate",
			billing_cycle_anchor: "now",
			carry_over_balances: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 570,
			usage: 0,
		});

		const { carriedOverCustomerEntitlements } =
			await getMessagesCustomerEntitlements({ ctx, customerId });

		expect(carriedOverCustomerEntitlements).toHaveLength(1);
		expect(carriedOverCustomerEntitlements[0].balance).toBe(70);
		expect(carriedOverCustomerEntitlements[0].expires_at).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-balance rollover 2: monthly rollover item carries balance with the rollover expiry")}`,
	async () => {
		const monthlyRollover = {
			max: null,
			length: 2,
			duration: RolloverExpiryDurationType.Month,
		};
		const proMessages = items.monthlyMessagesWithRollover({
			includedUsage: 100,
			rolloverConfig: monthlyRollover,
		});
		const premiumMessages = items.monthlyMessagesWithRollover({
			includedUsage: 500,
			rolloverConfig: monthlyRollover,
		});

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId: "carry-over-balance-rollover-month",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
			],
		});

		const { planCustomerEntitlement: proCustomerEntitlement } =
			await getMessagesCustomerEntitlements({ ctx, customerId });
		const proNextResetAt = proCustomerEntitlement?.next_reset_at;
		expect(proNextResetAt).toBeNumber();

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			plan_schedule: "immediate",
			carry_over_balances: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 570,
			usage: 0,
		});

		const { carriedOverCustomerEntitlements } =
			await getMessagesCustomerEntitlements({ ctx, customerId });

		expect(carriedOverCustomerEntitlements).toHaveLength(1);
		expect(carriedOverCustomerEntitlements[0].balance).toBe(70);
		expect(carriedOverCustomerEntitlements[0].expires_at).toBe(
			addMonths(proNextResetAt as number, monthlyRollover.length).getTime(),
		);
	},
);
