import {
	type AppEnv,
	CreateFreeTrialSchema,
	CusProductStatus,
	FreeTrialDuration,
	LegacyVersion,
	type Organization,
	organizations,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "free1";

const trial1 = CreateFreeTrialSchema.parse({
	length: 7,
	duration: FreeTrialDuration.Day,
});

export const free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isDefault: false,
	freeTrial: trial1,
	type: "free",
	id: "enterprise_trial",
});
export const addOn = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 1000,
		}),
	],
	isDefault: false,
	type: "free",
	isAddOn: true,
	id: "add_on",
});

describe(`${chalk.yellowBright(`${testCase}: Testing free product with trial and attaching add on`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();
	const numUsers = 0;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await db
			.update(organizations)
			.set({
				config: {
					...this.org.config,
					multiple_trials: true,
				},
			})
			.where(eq(organizations.id, org.id));

		await clearOrgCache({
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [free, addOn],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free, addOn],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	const approximateDiff = 1000 * 60 * 30; // 30 minutes
	it("should attach free product with trial", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: free.id,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const customer = await autumn.customers.get(customerId);
		const freeProduct = customer.products.find((p) => p.id === free.id);

		expect(freeProduct).to.exist;
		expect(freeProduct?.status).to.equal(CusProductStatus.Trialing);
		expect(freeProduct?.current_period_end).to.approximately(
			addDays(Date.now(), trial1.length).getTime(),
			approximateDiff,
		);
	});

	const trial2 = CreateFreeTrialSchema.parse({
		length: 14,
		duration: FreeTrialDuration.Day,
	});

	it("should update free product's trial end date", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: free.id,
			free_trial: trial2,
			is_custom: true,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
			free_trial: trial2,
			is_custom: true,
		});

		const customer = await autumn.customers.get(customerId);
		const freeProduct = customer.products.find((p) => p.id === free.id);

		expect(freeProduct?.status).to.equal(CusProductStatus.Trialing);
		expect(freeProduct?.current_period_end).to.approximately(
			addDays(Date.now(), trial2.length).getTime(),
			approximateDiff,
		);
	});

	it("should attach add on product", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const customer = await autumn.customers.get(customerId);
		const addOnProduct = customer.products.find((p) => p.id === addOn.id);
		const freeProduct = customer.products.find((p) => p.id === free.id);

		expect(addOnProduct).to.exist;
		expect(addOnProduct?.status).to.equal(CusProductStatus.Active);
		expect(freeProduct?.status).to.equal(CusProductStatus.Trialing);
	});

	after(async function () {
		await db
			.update(organizations)
			.set({
				config: {
					...this.org.config,
					multiple_trials: false,
				},
			})
			.where(eq(organizations.id, org.id));

		await clearOrgCache({
			db,
			orgId: org.id,
			env,
		});

		await CacheManager.disconnect();
	});
});
