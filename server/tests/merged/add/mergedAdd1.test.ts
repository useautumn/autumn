import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import { getAttachPreviewTotal } from "@tests/utils/testAttachUtils/getAttachPreviewTotal.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

describe(`${chalk.yellowBright("mergedAdd1: Testing merged subs, with track")}`, () => {
	const customerId = "mergedAdd1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: customerId,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
	});

	const entities = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "Entity 2",
			feature_id: TestFeature.Users,
		},
	];

	test("should attach pro product", async () => {
		await autumn.entities.create(customerId, entities);

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "1",
		});

		const expectedTotal = await getAttachPreviewTotal({
			customerId,
			productId: pro.id,
			entityId: "2",
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: "2",
		});

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices;

		expect(invoice[0].total).toBe(expectedTotal);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});

	test("should track usage and have correct invoice end of month", async () => {
		const value1 = 110000;
		const value2 = 310000;
		const values = [value1, value2];
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: value1,
			entity_id: "1",
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: value2,
			entity_id: "2",
		});

		await timeout(3000);

		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		let total = 0;
		for (let i = 0; i < entities.length; i++) {
			const expectedTotal = await getExpectedInvoiceTotal({
				customerId,
				productId: pro.id,
				usage: [{ featureId: TestFeature.Words, value: values[i] }],
				onlyIncludeUsage: true,
				stripeCli,
				db,
				org,
				env,
			});
			total += expectedTotal;
		}

		const basePrice = getBasePrice({ product: pro });

		const customer = await autumn.customers.get(customerId);
		const invoice = customer.invoices;
		expect(invoice[0].total).toBe(basePrice * 2 + total);
	});
});
