// import { beforeAll, describe, expect, test } from "bun:test";
// import { type ApiCustomer, ApiVersion, type LimitedItem } from "@autumn/shared";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import ctx from "@tests/utils/testInitUtils/createTestContext.js";
// import chalk from "chalk";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { CusService } from "@/internal/customers/CusService.js";
// import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
// import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
// import { timeout } from "../../utils/genUtils.js";

// const usersFeature = constructArrearItem({
// 	featureId: TestFeature.Users,
// 	price: 10,
// 	billingUnits: 1,
// 	includedUsage: 0,
// }) as LimitedItem;

// const freeProd = constructProduct({
// 	type: "free",
// 	id: "pay-per-use-users-balance-update3",
// 	isDefault: false,
// 	items: [usersFeature],
// });

// const testCase = "balances-update3";

// describe(`${chalk.yellowBright("balances-update3: Balance decoupling tests")}`, () => {
// 	const customerId = testCase;
// 	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

// 	const getRawCusEnt = async () => {
// 		const fullCus = await CusService.getFull({
// 			db: ctx.db,
// 			idOrInternalId: customerId,
// 			orgId: ctx.org.id,
// 			env: ctx.env,
// 		});

// 		return fullCus.customer_products
// 			.flatMap((cp) => cp.customer_entitlements)
// 			.find(
// 				(ce) =>
// 					ce.internal_feature_id ===
// 					ctx.features.find((f) => f.id === TestFeature.Users)?.internal_id,
// 			);
// 	};

// 	const logState = async (label: string) => {
// 		const cusEnt = await getRawCusEnt();
// 		const customer = (await autumnV2.customers.get(
// 			customerId,
// 		)) as unknown as ApiCustomer;
// 		const balance = customer.balances[TestFeature.Users];

// 		console.log(`\n=== ${label} ===`);
// 		console.log("DB:", {
// 			bal: cusEnt?.balance,
// 			add_bal: cusEnt?.additional_balance,
// 			add_grant: cusEnt?.adjustment,
// 		});
// 		console.log("API:", {
// 			granted: balance.granted_balance,
// 			purchased: balance.purchased_balance,
// 			current: balance.current_balance,
// 			usage: balance.usage,
// 		});
// 	};

// 	beforeAll(async () => {
// 		await initCustomerV3({
// 			ctx,
// 			customerId,
// 			withTestClock: false,
// 			attachPm: "success",
// 		});

// 		await initProductsV0({
// 			ctx,
// 			products: [freeProd],
// 			prefix: testCase,
// 		});

// 		await autumnV2.attach({
// 			customer_id: customerId,
// 			product_id: freeProd.id,
// 		});

// 		await timeout(1000);

// 		await logState("INITIAL STATE");
// 	});

// 	test("CASE A: balances.update ADD balance", async () => {
// 		// Setup: balance=0, add_bal=0, add_grant=0
// 		// Update to 10: diff=+10
// 		// Expected: balance=0, add_bal=10, add_grant=10

// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 10,
// 		});

// 		await timeout(2000);

// 		await logState("After CASE A");

// 		const cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(0); // Unchanged
// 		expect(cusEnt?.additional_balance).toBe(10); // Added
// 		expect(cusEnt?.adjustment).toBe(10); // Added

// 		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
// 		const balance = customer.balances[TestFeature.Users];
// 		// current = 0 + 0 + 10 = 10
// 		expect(balance.current_balance).toBe(10);
// 		expect(balance.granted_balance).toBe(10);
// 	});

// 	test("CASE B: balances.update REMOVE with sufficient additional_balance", async () => {
// 		// Setup: balance=0, add_bal=10, add_grant=10, current=10
// 		// Update to 5: diff=-5
// 		// Deduct 5 from add_bal → add_bal=5, balance=0
// 		// Expected: balance=0, add_bal=5, add_grant=5

// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 5,
// 		});

// 		await timeout(2000);

// 		await logState("After CASE B");

// 		const cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(0); // Unchanged (all came from add_bal)
// 		expect(cusEnt?.additional_balance).toBe(5); // 10 - 5
// 		expect(cusEnt?.adjustment).toBe(5); // 10 - 5

// 		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
// 		const balance = customer.balances[TestFeature.Users];

// 		expect(balance.current_balance).toBe(5);
// 	});

// 	test("CASE C: balances.update REMOVE with insufficient additional_balance", async () => {
// 		// Setup: balance=0, add_bal=5, add_grant=5, current=5
// 		// Update to 0: diff=-5
// 		// Deduct 5 from add_bal → add_bal=0, remaining=0, balance=0
// 		// Expected: balance=0, add_bal=0, add_grant=0

// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 0,
// 		});

// 		await timeout(2000);

// 		await logState("After CASE C");

// 		const cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(0);
// 		expect(cusEnt?.additional_balance).toBe(0); // Floored
// 		expect(cusEnt?.adjustment).toBe(0); // 5 - 5

// 		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
// 		const balance = customer.balances[TestFeature.Users];
// 		expect(balance.current_balance).toBe(0);
// 	});

// 	test("Track +5 then update REMOVE to trigger main balance deduction", async () => {
// 		// Track +5 to create main balance
// 		await autumnV2.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			value: 5,
// 		});

// 		await timeout(2000);

// 		let cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(-5); // Overage

// 		// Now update to add balance
// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 10,
// 		});

// 		await timeout(2000);

// 		await logState("After track +5 then update to 10");

// 		cusEnt = await getRawCusEnt();
// 		// computed_current = Math.max(0, -5) + 0 = 0
// 		// diff = 10 - 0 = +10
// 		// add_bal = 0 + 10 = 10, add_grant = 0 + 10 = 10, balance = -5
// 		expect(cusEnt?.balance).toBe(-5); // Unchanged
// 		expect(cusEnt?.additional_balance).toBe(10);
// 		expect(cusEnt?.adjustment).toBe(10);

// 		// Now remove: update to 3
// 		// current = Math.max(0, -5) + 10 = 10
// 		// diff = 3 - 10 = -7
// 		// Deduct 7: 7 from add_bal → add_bal=3, balance=-5
// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 3,
// 		});

// 		await timeout(2000);

// 		await logState("After update to 3");

// 		cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(-5); // Unchanged
// 		expect(cusEnt?.additional_balance).toBe(3); // 10 - 7
// 		expect(cusEnt?.adjustment).toBe(3); // 10 - 7
// 	});

// 	test("CASE D: balances.update from negative to positive preserves paid credits", async () => {
// 		// Setup: balance=-5, add_bal=3, add_grant=3
// 		// Update to 0:
// 		// current = Math.max(0,-5) + 3 = 3
// 		// diff = 0 - 3 = -3
// 		// Deduct 3 from add_bal → add_bal=0, balance=-5
// 		// Result: current = Math.max(0,-5) + 0 = 0 ✅

// 		await autumnV2.balances.update({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			current_balance: 0,
// 		});

// 		await timeout(2000);

// 		await logState("After CASE D");

// 		const cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(-5); // Unchanged (still in debt)
// 		expect(cusEnt?.additional_balance).toBe(0); // 3 - 3
// 		expect(cusEnt?.adjustment).toBe(0); // 3 - 3
// 	});

// 	test("CASE E: Track negative to fully return debt", async () => {
// 		// Setup: balance=-5, add_bal=0, add_grant=0 (from CASE D)
// 		// Track -5: adds 5 to main balance
// 		// Expected: balance=0, add_bal=0, add_grant=0

// 		await autumnV2.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Users,
// 			value: -5,
// 		});

// 		await timeout(2000);

// 		await logState("After CASE E");

// 		const cusEnt = await getRawCusEnt();
// 		expect(cusEnt?.balance).toBe(0); // -5 + 5 = 0
// 		expect(cusEnt?.additional_balance).toBe(0); // Unchanged
// 		expect(cusEnt?.adjustment).toBe(0); // Unchanged

// 		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
// 		const balance = customer.balances[TestFeature.Users];

// 		expect(balance.current_balance).toBe(0);
// 		expect(balance.purchased_balance).toBe(0);
// 		expect(balance.granted_balance).toBe(0);
// 		expect(balance.usage).toBe(0);
// 	});
// });
