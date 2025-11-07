import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// OPERATIONS:
// Premium, Premium
// Pro, Pro
// Premium, Premium

// UNCOMMENT FROM HERE
const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const init = [
	{ entityId: "1", product: premium }, // upgrade to premium
	{ entityId: "2", product: premium }, // upgrade to premium
];

const ops1 = [
	{
		entityId: "1",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
	{
		entityId: "2",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
];

// Renew
const ops2 = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
];

describe(`${chalk.yellowBright("mergedDowngrade1: Testing merged subs, downgrade 2 pros")}`, () => {
	const customerId = "mergedDowngrade1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, premium],
			prefix: customerId,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = testClockId1!;
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

	it("should attach pro product to both entities", async () => {
		await autumn.entities.create(customerId, entities);

		for (const op of init) {
			await autumn.attach({
				customer_id: customerId,
				product_id: op.product.id,
				entity_id: op.entityId,
			});
		}
	});

	it("should downgrade both entities to pro and have correct sub + schedule", async () => {
		for (const op of ops1) {
			await autumn.attach({
				customer_id: customerId,
				product_id: pro.id,
				entity_id: op.entityId,
			});

			const entity = await autumn.entities.get(customerId, op.entityId);
			for (const result of op.results) {
				expectProductAttached({
					customer: entity,
					product: result.product,
					entityId: op.entityId,
				});
			}
			expect(
				entity.products.filter((p: any) => p.group == premium.group).length,
			).to.equal(op.results.length);

			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
			});
		}
	});

	it("should renew both entities and have correct sub + schedule", async () => {
		for (const op of ops2) {
			await autumn.attach({
				customer_id: customerId,
				product_id: op.product.id,
				entity_id: op.entityId,
			});

			const entity = await autumn.entities.get(customerId, op.entityId);
			for (const result of op.results) {
				expectProductAttached({
					customer: entity,
					product: result.product,
					entityId: op.entityId,
				});
			}
			expect(
				entity.products.filter((p: any) => p.group == premium.group).length,
			).to.equal(op.results.length);

			await expectSubToBeCorrect({
				db,
				customerId,
				org,
				env,
			});
		}
	});
});
