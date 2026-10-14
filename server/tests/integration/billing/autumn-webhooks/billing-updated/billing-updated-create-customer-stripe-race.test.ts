import { expect, mock, test } from "bun:test";
import { WebhookEventType } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type Emission = {
	eventType: string;
	customerId: string | undefined;
	stripeIdAtEmission: string | null;
};

const emissions: Emission[] = [];

const actualSvixHelpers = await import("@/external/svix/svixHelpers.js");

mock.module("@/external/svix/svixHelpers.js", () => ({
	...actualSvixHelpers,
	sendSvixEvent: async (
		args: Parameters<typeof actualSvixHelpers.sendSvixEvent>[0],
	) => {
		const { ctx, eventType, data } = args;
		const customerId = (data as { customer_id?: string })?.customer_id;

		let stripeIdAtEmission: string | null = null;
		try {
			const { CusService } = await import("@/internal/customers/CusService.js");
			const row = await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId ?? "",
				orgId: ctx.org.id,
				env: ctx.env,
			});
			stripeIdAtEmission = row?.processor?.id ?? null;
		} catch {
			stripeIdAtEmission = null;
		}

		emissions.push({ eventType, customerId, stripeIdAtEmission });

		return actualSvixHelpers.sendSvixEvent(args);
	},
}));

const { createCustomerWithDefaults } = await import(
	"@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js"
);

test(`${chalk.yellowBright("billing.updated: create customer with create_in_stripe → stripe id persisted before emission")}`, async () => {
	const customerId = "billing-updated-create-stripe-race";

	const freeDefault = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { ctx } = await initScenario({
		setup: [
			s.products({
				list: [freeDefault],
				prefix: customerId,
				customerIdsToDelete: [customerId],
			}),
		],
		actions: [],
	});

	const fullCustomer = await createCustomerWithDefaults({
		ctx,
		customerId,
		customerData: {
			name: "Stripe Race Test",
			email: `${customerId}@example.com`,
			create_in_stripe: true,
		},
	});

	expect(fullCustomer.processor?.id).toStartWith("cus_");

	const deadline = Date.now() + 10_000;
	let emission: Emission | undefined;
	while (!emission && Date.now() < deadline) {
		emission = emissions.find(
			(e) =>
				e.eventType === WebhookEventType.BillingUpdated &&
				e.customerId === customerId,
		);
		if (!emission) await new Promise((resolve) => setTimeout(resolve, 100));
	}

	expect(emission).toBeDefined();

	expect(emission?.stripeIdAtEmission).toStartWith("cus_");
});
