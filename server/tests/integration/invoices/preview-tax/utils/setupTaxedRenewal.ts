import type { ApiListInvoiceV1 } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

export const setupTaxedRenewal = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({ id: "preview-tax", items: [] });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["GB", "FR", "AU"],
			}),
			s.customer({
				paymentMethod: "success",
				testClock: true,
				stripeCustomerOverrides: {
					address: {
						country: "GB",
						line1: "1 Test Street",
						city: "London",
						postal_code: "SW1A 1AA",
					},
				},
			}),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const stripe = scenario.ctx.stripeCli;
	const stripeCustomerId = scenario.customer!.processor!.id!;
	const subscriptions = await stripe.subscriptions
		.list({ customer: stripeCustomerId, limit: 100 })
		.autoPagingToArray({ limit: 100 });
	if (subscriptions.length !== 1)
		throw new Error("Expected exactly one subscription");
	await stripe.subscriptions.update(subscriptions[0].id, {
		collection_method: "send_invoice",
		days_until_due: 14,
	});
	const renewedAt = await advanceTestClock({
		stripeCli: stripe,
		testClockId: scenario.testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 15,
	});
	await advanceTestClock({
		stripeCli: stripe,
		testClockId: scenario.testClockId!,
		startingFrom: new Date(renewedAt),
		numberOfHours: 2,
		waitForSeconds: 15,
	});
	for (let attempt = 0; attempt < 30; attempt++) {
		const { list } = (await scenario.autumnV2_4.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		if (list[0]?.status === "open")
			return { ...scenario, stripeCustomerId, original: list[0] };
		await Bun.sleep(2000);
	}
	throw new Error("Taxed renewal never reached Autumn");
};
