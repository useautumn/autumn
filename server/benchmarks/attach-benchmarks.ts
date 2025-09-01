import chalk from "chalk";
import {
	BenchmarkRunner,
	DryRunHelper,
	createMockCustomer,
	createMockProduct,
} from "./benchmark-utils.js";

// Mock product attachment operations
const mockAttachProduct = async (params: any) => {
	const { customer_id, product_id, force_checkout } = params;

	// Simulate the attach workflow from existing tests
	DryRunHelper.mockDbOperation("getCustomer", { customerId: customer_id });
	DryRunHelper.mockDbOperation("getProduct", { productId: product_id });

	// Simulate pricing calculations
	DryRunHelper.mockComplexCalculation(300); // Price calculation logic

	if (force_checkout) {
		// Simulate Stripe checkout creation
		DryRunHelper.mockStripeOperation("createCheckout", {
			customer_id,
			product_id,
		});
	}

	// Simulate entitlement updates
	DryRunHelper.mockDbOperation("updateEntitlements", {
		customer_id,
		product_id,
		entitlements: ["premium_feature", "advanced_api"],
	});

	return { success: true, attached: true };
};

const mockUpgradeProduct = async (params: any) => {
	const { customer_id, from_product_id, to_product_id } = params;

	// Simulate upgrade workflow
	DryRunHelper.mockDbOperation("getCurrentProduct", {
		customer_id,
		from_product_id,
	});
	DryRunHelper.mockDbOperation("getTargetProduct", { to_product_id });

	// Simulate prorated billing calculation (CPU intensive)
	DryRunHelper.mockComplexCalculation(800);

	// Simulate Stripe subscription update
	DryRunHelper.mockStripeOperation("updateSubscription", {
		customer_id,
		from_product_id,
		to_product_id,
	});

	// Update entitlements
	DryRunHelper.mockDbOperation("migrateEntitlements", {
		customer_id,
		from_product_id,
		to_product_id,
	});

	return { success: true, upgraded: true };
};

const mockDowngradeProduct = async (params: any) => {
	const { customer_id, from_product_id, to_product_id } = params;

	// Similar to upgrade but with different calculations
	DryRunHelper.mockDbOperation("getCurrentProduct", {
		customer_id,
		from_product_id,
	});
	DryRunHelper.mockDbOperation("getTargetProduct", { to_product_id });

	// Downgrade calculations (typically simpler)
	DryRunHelper.mockComplexCalculation(400);

	// Stripe operations
	DryRunHelper.mockStripeOperation("updateSubscription", {
		customer_id,
		from_product_id,
		to_product_id,
	});

	// Handle feature restrictions
	DryRunHelper.mockDbOperation("restrictEntitlements", {
		customer_id,
		restricted_features: ["premium_feature"],
	});

	return { success: true, downgraded: true };
};

const mockCalculatePricing = async (params: any) => {
	const { product_id, customer_id, usage_data } = params;

	// Simulate complex pricing calculation
	DryRunHelper.mockDbOperation("getProductPricing", { product_id });
	DryRunHelper.mockDbOperation("getCustomerUsage", { customer_id });

	// CPU-intensive pricing calculations
	DryRunHelper.mockComplexCalculation(600);

	// Simulate tier-based pricing logic
	const tiers = usage_data?.tiers || [100, 1000, 10000];
	let totalCost = 0;
	for (const tier of tiers) {
		totalCost += tier * 0.01; // Mock pricing calculation
	}

	return { totalCost, breakdown: tiers };
};

const mockEntityAttachment = async (params: any) => {
	const { customer_id, product_id, entity_id } = params;

	// Simulate entity-specific attachment
	DryRunHelper.mockDbOperation("getEntity", { entity_id });
	DryRunHelper.mockDbOperation("attachToEntity", {
		customer_id,
		product_id,
		entity_id,
	});

	// Entity-specific calculations
	DryRunHelper.mockComplexCalculation(200);

	return { success: true, entity_attached: true };
};

export const runAttachBenchmarks = async () => {
	const runner = new BenchmarkRunner({
		iterations: 50,
		warmupIterations: 5,
	});

	console.log(chalk.cyan("🔗 Product & Billing Operations"));
	console.log(chalk.gray("Measuring subscription and pricing workflows\n"));

	// Real-world product operations
	await runner.run("Free Plan Signup", async () => {
		await mockAttachProduct({
			customer_id: "new_customer_123",
			product_id: "starter_free",
			force_checkout: false,
		});
	});

	await runner.run("Paid Plan Subscription", async () => {
		await mockAttachProduct({
			customer_id: "converting_customer_456",
			product_id: "pro_monthly",
			force_checkout: true,
		});
	});

	await runner.run("Plan Upgrade (Basic → Pro)", async () => {
		await mockUpgradeProduct({
			customer_id: "existing_customer_789",
			from_product_id: "basic_monthly",
			to_product_id: "pro_monthly",
		});
	});

	await runner.run("Plan Downgrade (Pro → Basic)", async () => {
		await mockDowngradeProduct({
			customer_id: "downgrading_customer_321",
			from_product_id: "pro_monthly",
			to_product_id: "basic_monthly",
		});
	});

	await runner.run("Usage-Based Pricing Calc", async () => {
		await mockCalculatePricing({
			product_id: "usage_tier_product",
			customer_id: "heavy_user_654",
			usage_data: {
				tiers: [1000, 5000, 25000, 100000],
				features: ["api_requests", "storage_gb", "compute_hours"],
			},
		});
	});

	await runner.run("Team Plan Setup", async () => {
		await mockEntityAttachment({
			customer_id: "team_lead_987",
			product_id: "team_plan",
			entity_id: "team_acme_corp",
		});
	});

	await runner.run("Bulk Plan Changes (5 customers)", async () => {
		const promises: Promise<any>[] = [];
		for (let i = 0; i < 5; i++) {
			promises.push(
				mockAttachProduct({
					customer_id: `bulk_customer_${i}`,
					product_id: "standard_plan",
					force_checkout: false,
				}),
			);
		}
		await Promise.all(promises);
	});

	runner.printSummary();
	return runner.getResults();
};
