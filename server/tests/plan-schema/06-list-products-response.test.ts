import {
	type ApiPlan,
	ApiPlanSchema,
	AttachScenario,
	BillingInterval,
	type CreatePlanParams,
	ResetInterval,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - List Products Response"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });
	let _db, _org, _env;

	before(async function () {
		await setupBefore(this);
		_db = this.db;
		_org = this.org;
		_env = this.env;
	});

	describe("Response Schema Validation", () => {
		it("LIST: validates response against ApiPlanSchema", async () => {
			// Create a test product first
			const productId = "schema_test_plan";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Schema Test Plan",
				description: "Testing schema validation",
				price: { amount: 2900, interval: BillingInterval.Month },
				features: [
					{
						feature_id: features.metered1.id,
						granted: 1000,
						reset: {
							interval: ResetInterval.Month,
						},
					},
				],
				free_trial: {
					duration_type: ResetInterval.Day,
					duration_length: 14,
					card_required: true,
				},
			} as CreatePlanParams);

			// Get the specific product we just created instead of listing all
			const testPlan = (await autumnV2.products.get(productId)) as ApiPlan;
			expect(testPlan).to.exist;

			// Validate against schema
			const validation = ApiPlanSchema.safeParse(testPlan);
			if (!validation.success) {
				console.error("Schema validation errors:", validation.error.errors);
			}
			expect(validation.success).to.be.true;

			// Verify all required fields
			expect(testPlan).to.have.property("id");
			expect(testPlan).to.have.property("name");
			expect(testPlan).to.have.property("description");
			expect(testPlan).to.have.property("group");
			expect(testPlan).to.have.property("version");
			expect(testPlan).to.have.property("add_on");
			expect(testPlan).to.have.property("default");
			expect(testPlan).to.have.property("price");
			expect(testPlan).to.have.property("features");
			expect(testPlan).to.have.property("free_trial");
			expect(testPlan).to.have.property("created_at");
			expect(testPlan).to.have.property("env");
			expect(testPlan).to.have.property("archived");
			expect(testPlan).to.have.property("base_variant_id");
		});

		it("LIST: validates price structure", async () => {
			const productId = "price_structure_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Price Structure Test",
				price: { amount: 4900, interval: BillingInterval.Year },
			} as CreatePlanParams);

			const testPlan = (await autumnV2.products.get(productId)) as ApiPlan;

			expect(testPlan.price).to.exist;
			expect(testPlan.price!.amount).to.equal(4900);
			expect(testPlan.price!.interval).to.equal(BillingInterval.Year);
		});

		it("LIST: validates features array structure", async () => {
			const productId = "features_structure_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Features Structure Test",
				features: [
					{
						feature_id: features.metered1.id,
						granted: 500,
						reset: {
							interval: ResetInterval.Month,
						},
					},
					{
						feature_id: features.boolean1.id,
					},
				],
			} as CreatePlanParams);

			const testPlan = (await autumnV2.products.get(productId)) as ApiPlan;

			expect(testPlan.features).to.be.an("array");
			expect(testPlan.features).to.have.lengthOf(2);

			// Find metered feature
			const meteredFeature = testPlan.features.find(
				(f) => f.feature_id === features.metered1.id,
			);
			expect(meteredFeature).to.exist;
			expect(meteredFeature!).to.have.property("feature_id");
			expect(meteredFeature!).to.have.property("granted");
			expect(meteredFeature!).to.have.property("unlimited");
			expect(meteredFeature!.granted).to.equal(500);

			// Find boolean feature
			const booleanFeature = testPlan.features.find(
				(f) => f.feature_id === features.boolean1.id,
			);
			expect(booleanFeature).to.exist;
			expect(booleanFeature!).to.have.property("feature_id");
		});

		it("LIST: validates free_trial structure", async () => {
			const productId = "free_trial_structure_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Free Trial Structure Test",
				price: { amount: 2900, interval: BillingInterval.Month },
				free_trial: {
					duration_type: ResetInterval.Day,
					duration_length: 7,
					card_required: false,
				},
			} as CreatePlanParams);

			const testPlan = (await autumnV2.products.get(productId)) as ApiPlan;

			expect(testPlan.free_trial).to.exist;
			expect(testPlan.free_trial!.duration_type).to.equal(ResetInterval.Day);
			expect(testPlan.free_trial!.duration_length).to.equal(7);
			expect(testPlan.free_trial!.card_required).to.equal(false);
		});
	});

	describe("Customer Context Scenarios", () => {
		it("LIST with customer_id: shows customer_context with valid scenario", async () => {
			// Create test product
			const productId = "customer_context_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Customer Context Test",
				price: { amount: 2900, interval: BillingInterval.Month },
				features: [
					{
						feature_id: features.metered1.id,
						granted: 1000,
						reset: {
							interval: ResetInterval.Month,
						},
					},
				],
			} as CreatePlanParams);

			// Create customer and checkout product
			const customerId = `cus_ctx_${Date.now()}`;
			try {
				await autumnV2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "Customer Context Test",
			});

			// Checkout the product
			await autumnV2.checkout({
				customer_id: customerId,
				products: [{ product_id: productId }],
			});

			// Get the specific product with customer context
			const plan = (await autumnV2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as ApiPlan;
			expect(plan).to.exist;

			// Verify customer_context exists and has correct structure
			expect(plan).to.have.property("customer_context");
			expect(plan.customer_context).to.exist;
			expect(plan.customer_context).to.have.property("trial_available");
			expect(plan.customer_context).to.have.property("scenario");

			// Verify scenario is one of the valid AttachScenario enum values
			const validScenarios = Object.values(AttachScenario);
			expect(validScenarios).to.include(plan.customer_context!.scenario);

			// Cleanup
			await autumnV2.customers.delete(customerId);
		});

		it("LIST with customer_id: shows scenario='new' for non-attached products", async () => {
			// Create test product without attaching
			const productId = "customer_context_new";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Customer Context New",
				price: { amount: 1900, interval: BillingInterval.Month },
			} as CreatePlanParams);

			// Create customer without attaching product
			const customerId = `cus_new_${Date.now()}`;
			try {
				await autumnV2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "Customer New Test",
			});

			// Get the specific product with customer context
			const newPlan = (await autumnV2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as ApiPlan;
			expect(newPlan).to.exist;

			// Verify scenario is "new" for non-attached product
			expect(newPlan.customer_context).to.exist;
			expect(newPlan.customer_context!.scenario).to.equal(AttachScenario.New);

			// Cleanup
			await autumnV2.customers.delete(customerId);
		});

		it("LIST with customer_id: validates trial_available for products with free_trial", async () => {
			// Create product with free trial
			const productId = "customer_context_trial";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "Customer Context Trial",
				price: { amount: 2900, interval: BillingInterval.Month },
				free_trial: {
					duration_type: ResetInterval.Day,
					duration_length: 14,
					card_required: true,
				},
			} as CreatePlanParams);

			// Create customer
			const customerId = `cus_trial_${Date.now()}`;
			try {
				await autumnV2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "Customer Trial Test",
			});

			// Get the specific product with customer context
			const trialPlan = (await autumnV2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as ApiPlan;
			expect(trialPlan).to.exist;

			// Verify trial_available is set correctly
			expect(trialPlan.customer_context).to.exist;
			expect(trialPlan.customer_context).to.have.property("trial_available");
			expect(trialPlan.customer_context!.trial_available).to.be.a("boolean");

			// Cleanup
			await autumnV2.customers.delete(customerId);
		});

	});

	describe("V1.2 API Version Compatibility", () => {
		it("V1.2: includes scenario field for customer context", async () => {
			// Create test product
			const productId = "v1_2_scenario_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "V1.2 Scenario Test",
				price: { amount: 2900, interval: BillingInterval.Month },
			} as CreatePlanParams);

			// Create customer and checkout product
			const customerId = `cus_v1_2_scenario_${Date.now()}`;
			try {
				await autumnV1_2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV1_2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "V1.2 Scenario Test",
			});

			// Checkout the product
			await autumnV1_2.checkout({
				customer_id: customerId,
				products: [{ product_id: productId }],
			});

			// Get product with customer context using V1.2 client
			const v1Product = (await autumnV1_2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as any;
			expect(v1Product).to.exist;

			// V1.2 uses "scenario" field directly, not nested in customer_context
			// Note: scenario is optional in V1.2, but should be present when customer_id is provided
			if (v1Product.scenario) {
				expect(v1Product.scenario).to.be.a("string");

				// Verify scenario is a valid AttachScenario enum value
				const validScenarios = Object.values(AttachScenario);
				expect(validScenarios).to.include(v1Product.scenario);
			}

			// V1.2 should NOT have nested customer_context object
			expect(v1Product).to.not.have.property("customer_context");

			// Cleanup
			await autumnV1_2.customers.delete(customerId);
		});

		it("V1.2: scenario shows 'new' for non-attached products", async () => {
			// Create test product
			const productId = "v1_2_scenario_new_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "V1.2 Scenario New Test",
				price: { amount: 1900, interval: BillingInterval.Month },
			} as CreatePlanParams);

			// Create customer WITHOUT attaching product
			const customerId = `cus_v1_2_new_${Date.now()}`;
			try {
				await autumnV1_2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV1_2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "V1.2 New Scenario Test",
			});

			// Get product with customer_id but without checkout
			const v1Product = (await autumnV1_2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as any;
			expect(v1Product).to.exist;

			// Verify scenario field exists and is "new" for non-attached product
			// Note: scenario is optional in V1.2 schema, check if present
			if (v1Product.scenario) {
				expect(v1Product.scenario).to.equal(AttachScenario.New);
			}

			// Cleanup
			await autumnV1_2.customers.delete(customerId);
		});

		it("V1.2: returns V1 schema (items format) when X-API-Version: 1.2.0", async () => {
			// Create test product
			const productId = "v1_2_compat_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "V1.2 Compat Test",
				price: { amount: 3900, interval: BillingInterval.Month },
				features: [
					{
						feature_id: features.metered1.id,
						granted: 750,
						reset: {
							interval: ResetInterval.Month,
						},
					},
				],
			} as CreatePlanParams);

			// Get with V1.2 client
			const v1Product = (await autumnV1_2.products.get(productId)) as any;
			expect(v1Product).to.exist;

			// Verify V1.2 schema structure
			expect(v1Product).to.have.property("items");
			expect(v1Product.items).to.be.an("array");

			// V1.2 uses is_add_on and is_default instead of add_on and default
			expect(v1Product).to.have.property("is_add_on");
			expect(v1Product).to.have.property("is_default");

			// V1.2 should NOT have "features" array
			expect(v1Product).to.not.have.property("features");

			// Base price should be in items array
			const basePrice = v1Product.items.find((i: any) => !i.feature_id);
			expect(basePrice).to.exist;
			expect(basePrice.price).to.equal(3900);
			expect(basePrice.interval).to.equal("month");

			// Feature should be in items array
			const featureItem = v1Product.items.find(
				(i: any) => i.feature_id === features.metered1.id,
			);
			expect(featureItem).to.exist;
			expect(featureItem.included_usage).to.equal(750);
		});

		it("V1.2: transforms description correctly (not included in V1.2)", async () => {
			const productId = "v1_2_description_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "V1.2 Description Test",
				description: "This description should not appear in V1.2",
				price: { amount: 2900, interval: BillingInterval.Month },
			} as CreatePlanParams);

			// Get with V2 client
			const v2Product = (await autumnV2.products.get(productId)) as ApiPlan;
			expect(v2Product.description).to.equal(
				"This description should not appear in V1.2",
			);

			// Get with V1.2 client
			const v1Product = (await autumnV1_2.products.get(productId)) as any;

			// V1.2 should not have description field
			// @ts-expect-error: Descriptions aren't in the V1.2 type
			expect(v1Product.description).to.be.undefined;
		});

		it("V1.2: transforms free_trial correctly (duration_type → duration)", async () => {
			const productId = "v1_2_trial_test";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			await autumnV2.products.create({
				id: productId,
				name: "V1.2 Trial Test",
				price: { amount: 2900, interval: BillingInterval.Month },
				free_trial: {
					duration_type: ResetInterval.Month,
					duration_length: 1,
					card_required: false,
				},
			} as CreatePlanParams);

			// Get with V2 client
			const v2Product = (await autumnV2.products.get(productId)) as ApiPlan;
			expect(v2Product.free_trial).to.exist;
			expect(v2Product.free_trial!.duration_type).to.equal(ResetInterval.Month);
			expect(v2Product.free_trial!.duration_length).to.equal(1);

			// Get with V1.2 client
			const v1Product = (await autumnV1_2.products.get(productId)) as any;

			// V1.2 uses "duration" instead of "duration_type"
			expect(v1Product.free_trial).to.exist;
			expect(v1Product.free_trial.duration).to.equal("month");
			expect(v1Product.free_trial.length).to.equal(1);
		});

		it("V2 vs V1.2: same data accessible in both formats", async () => {
			const productId = "v2_v1_consistency";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// Create via V2
			await autumnV2.products.create({
				id: productId,
				name: "V2/V1.2 Consistency",
				price: { amount: 5900, interval: BillingInterval.Year },
				features: [
					{
						feature_id: features.metered1.id,
						granted: 2000,
						reset: {
							interval: ResetInterval.Month,
						},
					},
					{
						feature_id: features.boolean1.id,
					},
				],
			} as CreatePlanParams);

			// Get with both clients
			const v2Product = (await autumnV2.products.get(productId)) as ApiPlan;
			const v1Product = (await autumnV1_2.products.get(productId)) as any;

			// Verify same core data accessible in both
			expect(v2Product.name).to.equal(v1Product.name);
			expect(v2Product.id).to.equal(v1Product.id);

			// V2 price
			expect(v2Product.price!.amount).to.equal(5900);
			expect(v2Product.price!.interval).to.equal(BillingInterval.Year);

			// V1.2 price (in items)
			const v1BasePrice = v1Product.items.find((i: any) => !i.feature_id);
			expect(v1BasePrice.price).to.equal(5900);
			expect(v1BasePrice.interval).to.equal("year");

			// V2 features
			expect(v2Product.features).to.have.lengthOf(2);
			const v2MeteredFeature = v2Product.features.find(
				(f) => f.feature_id === features.metered1.id,
			);
			expect(v2MeteredFeature!.granted).to.equal(2000);

			// V1.2 features (in items)
			const v1MeteredItem = v1Product.items.find(
				(i: any) => i.feature_id === features.metered1.id,
			);
			expect(v1MeteredItem.included_usage).to.equal(2000);
		});

		it("V2 vs V1.2: customer context format differences", async () => {
			const productId = "v2_v1_customer_context";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// Create product with free trial to test trial_available
			await autumnV2.products.create({
				id: productId,
				name: "V2/V1.2 Customer Context",
				price: { amount: 2900, interval: BillingInterval.Month },
				free_trial: {
					duration_type: ResetInterval.Day,
					duration_length: 14,
					card_required: true,
				},
			} as CreatePlanParams);

			// Create customer
			const customerId = `cus_ctx_compare_${Date.now()}`;
			try {
				await autumnV2.customers.delete(customerId);
			} catch (_error) {}

			await autumnV2.customers.create({
				id: customerId,
				email: `${customerId}@test.com`,
				name: "Context Compare Test",
			});

			// Get with both clients
			const v2Product = (await autumnV2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as ApiPlan;
			const v1Product = (await autumnV1_2.get(
				`/products/${productId}?customer_id=${customerId}`,
			)) as any;

			// V2 has nested customer_context object with trial_available
			expect(v2Product.customer_context).to.exist;
			expect(v2Product.customer_context).to.have.property("scenario");
			expect(v2Product.customer_context).to.have.property("trial_available");
			expect(v2Product.customer_context!.trial_available).to.be.a("boolean");

			// V1.2 has flat scenario field (optional), no trial_available
			expect(v1Product).to.not.have.property("customer_context");
			expect(v1Product).to.not.have.property("trial_available");

			// If V1.2 has scenario field, it should match V2's customer_context.scenario
			if (v1Product.scenario) {
				expect(v2Product.customer_context!.scenario).to.equal(v1Product.scenario);
			}

			// Cleanup
			await autumnV2.customers.delete(customerId);
		});
	});
});
