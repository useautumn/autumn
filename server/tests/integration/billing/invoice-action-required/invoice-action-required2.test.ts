import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { handleVoidInvoiceCron } from "@/cron/invoiceCron/runInvoiceCron";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachAuthenticatePaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 200,
			// unlimited: true,
		}),
	],
});

const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

describe(`${chalk.yellowBright("invoice-action-required2: Testing void invoice cron")}`, () => {
	const customerId = "invoice-action-required2";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: customerId,
		});
	});

	test("should attach pro product, then upgrade to premium and get checkout_url", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		// Get latest invoice for this customer
		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices?.[0].status).toBe("open");

		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id!,
		});

		const latestInvoice = stripeInvoices.data[0];

		expect(latestInvoice.metadata?.autumn_metadata_id).toBeDefined();
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: latestInvoice.metadata?.autumn_metadata_id ?? "",
		});

		await handleVoidInvoiceCron({
			metadata: metadata!,
			ctx: {
				db: ctx.db,
				logger: ctx.logger,
			},
		});

		const voidedInvoice = await ctx.stripeCli.invoices.retrieve(
			latestInvoice.id,
		);
		expect(voidedInvoice.status).toBe("void");

		await timeout(3000);
		const customer2 = await autumn.customers.get(customerId);
		expect(customer2.invoices?.[0].status).toBe("void");
	});
});
