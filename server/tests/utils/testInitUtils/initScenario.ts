import { ApiVersion, type ProductV2 } from "@autumn/shared";
import type { CustomerData } from "autumn-js";
import { addHours, addMonths } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { hoursToFinalizeInvoice } from "../constants.js";
import { advanceTestClock as advanceTestClockFn } from "../stripeUtils.js";
import ctx from "./createTestContext.js";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type AdvanceClockConfig = {
	days?: number;
	weeks?: number;
	hours?: number;
	months?: number;
	toNextInvoice?: boolean;
};

type ScenarioConfig = {
	testClock: boolean;
	attachPm?: "success" | "fail" | "authenticate";
	customerData?: CustomerData;
	withDefault: boolean;
	products: ProductV2[];
	entityConfig?: EntityConfig;
	attachments: AttachmentDef[];
	cancellations: CancelDef[];
	advanceClock?: AdvanceClockConfig;
	customerIds?: string[];
};

type EntityConfig = {
	count: number;
	featureId: string;
};

type FeatureOption = {
	feature_id: string;
	quantity: number;
};

type AttachmentDef = {
	productId: string;
	entityIndex?: number;
	options?: Array<{ feature_id: string; quantity: number }>;
	newBillingSubscription?: boolean;
};

type CancelDef = {
	productId: string;
	entityIndex?: number;
};

type GeneratedEntity = {
	id: string;
	name: string;
	featureId: string;
};

type ConfigFn = (config: ScenarioConfig) => ScenarioConfig;

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate entity definitions from count and featureId.
 * Creates entities with ids "ent-1", "ent-2", etc.
 */
const generateEntities = (config: EntityConfig): GeneratedEntity[] => {
	return Array.from({ length: config.count }, (_, i) => ({
		id: `ent-${i + 1}`,
		name: `Entity ${i + 1}`,
		featureId: config.featureId,
	}));
};

// ═══════════════════════════════════════════════════════════════════
// SCENARIO CONFIG FUNCTIONS (s.*)
// ═══════════════════════════════════════════════════════════════════

/**
 * Configure customer options: test clock, payment method, customer data, and default product.
 * @param testClock - Enable Stripe test clock for time manipulation (default: true)
 * @param paymentMethod - Attach payment method: "success", "fail", or "authenticate"
 * @param data - Customer metadata (fingerprint, name, email, etc.)
 * @param withDefault - Attach the default product on creation (default: false)
 * @example s.customer({ paymentMethod: "success" })
 * @example s.customer({ paymentMethod: "success", data: { name: "Test" } })
 */
const customer = ({
	testClock = true,
	paymentMethod,
	data,
	withDefault,
}: {
	testClock?: boolean;
	paymentMethod?: "success" | "fail" | "authenticate";
	data?: CustomerData;
	withDefault?: boolean;
}): ConfigFn => {
	return (config) => ({
		...config,
		testClock,
		attachPm: paymentMethod ?? config.attachPm,
		customerData: data ?? config.customerData,
		withDefault: withDefault ?? config.withDefault,
	});
};

/**
 * Define products to create for this test scenario.
 * Products are prefixed with customerId for test isolation.
 * @param list - Array of ProductV2 objects
 * @param customerIdsToDelete - Array of customer IDs to delete before creating products
 * @example s.products({ list: [pro, free], customerIdsToDelete: [customerId] })
 */
const products = ({
	list,
	customerIdsToDelete,
}: {
	list: ProductV2[];
	customerIdsToDelete?: string[];
}): ConfigFn => {
	return (config) => ({
		...config,
		products: list,
		customerIds: customerIdsToDelete,
	});
};

/**
 * Define entities to create for this test scenario.
 * Entities are auto-generated with ids "ent-1", "ent-2", etc.
 * @param count - Number of entities to create
 * @param featureId - Feature ID for all entities (e.g., TestFeature.Users)
 * @example s.entities({ count: 2, featureId: TestFeature.Users })
 */
const entities = ({
	count,
	featureId,
}: {
	count: number;
	featureId: string;
}): ConfigFn => {
	return (config) => ({ ...config, entityConfig: { count, featureId } });
};

/**
 * Attach a product to the customer or a specific entity.
 * Product ID is auto-prefixed with customerId.
 * @param productId - The product ID (without prefix)
 * @param entityIndex - Optional entity index (0-based) to attach to (omit for customer-level)
 * @param options - Optional feature options (e.g., prepaid quantity)
 * @param newBillingSubscription - Create a separate Stripe subscription for this product
 * @example s.attach({ productId: "pro" }) // customer-level
 * @example s.attach({ productId: "pro", entityIndex: 0 }) // attach to first entity (ent-1)
 * @example s.attach({ productId: "free", entityIndex: 1 }) // attach to second entity (ent-2)
 * @example s.attach({ productId: "pro", options: [{ feature_id: "messages", quantity: 100 }] })
 * @example s.attach({ productId: "addon", newBillingSubscription: true }) // separate subscription
 */
const attach = ({
	productId,
	entityIndex,
	options,
	newBillingSubscription,
}: {
	productId: string;
	entityIndex?: number;
	options?: FeatureOption[];
	newBillingSubscription?: boolean;
}): ConfigFn => {
	return (config) => ({
		...config,
		attachments: [
			...config.attachments,
			{ productId, entityIndex, options, newBillingSubscription },
		],
	});
};

/**
 * Cancel a product subscription for the customer or a specific entity.
 * Runs after all attachments.
 * @param productId - The product ID (without prefix)
 * @param entityIndex - Optional entity index (0-based) to cancel for (omit for customer-level)
 * @example s.cancel({ productId: "pro" }) // customer-level
 * @example s.cancel({ productId: "pro", entityIndex: 0 }) // cancel for first entity
 */
const cancel = ({
	productId,
	entityIndex,
}: {
	productId: string;
	entityIndex?: number;
}): ConfigFn => {
	return (config) => ({
		...config,
		cancellations: [...config.cancellations, { productId, entityIndex }],
	});
};

/**
 * Advance the Stripe test clock after all attachments.
 * @param days - Number of days to advance
 * @param weeks - Number of weeks to advance
 * @param hours - Number of hours to advance
 * @param months - Number of months to advance
 * @param toNextInvoice - Advance to next billing cycle + invoice finalization time
 * @example s.advanceTestClock({ days: 15 }) // advance 15 days
 * @example s.advanceTestClock({ months: 1 }) // advance 1 month
 * @example s.advanceTestClock({ toNextInvoice: true }) // advance to next invoice
 */
const advanceTestClock = ({
	days,
	weeks,
	hours,
	months,
	toNextInvoice,
}: {
	days?: number;
	weeks?: number;
	hours?: number;
	months?: number;
	toNextInvoice?: boolean;
}): ConfigFn => {
	return (config) => ({
		...config,
		advanceClock: { days, weeks, hours, months, toNextInvoice },
	});
};

/**
 * Scenario configuration functions.
 * Import and use with initScenario to configure test setup.
 * @example
 * ```typescript
 * import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
 *
 * const { autumnV1, ctx } = await initScenario({
 *   customerId: "my-test",
 *   options: [
 *     s.customer({ paymentMethod: "success" }),
 *     s.products({ list: [pro, free] }),
 *     s.attach({ productId: "pro" }),
 *   ],
 * });
 * ```
 */
export const s = {
	customer,
	products,
	entities,
	attach,
	cancel,
	advanceTestClock,
} as const;

// ═══════════════════════════════════════════════════════════════════
// INIT SCENARIO
// ═══════════════════════════════════════════════════════════════════

const defaultConfig: ScenarioConfig = {
	testClock: false,
	withDefault: false,
	products: [],
	attachments: [],
	cancellations: [],
};

/**
 * Initialize a complete test scenario with customer, products, entities, and attachments.
 * Uses functional composition for flexible configuration.
 *
 * @param customerId - Unique identifier used as customer ID and product prefix
 * @param setup - Configuration functions (customer, products, entities)
 * @param actions - Action functions (attach, cancel, advanceTestClock)
 * @returns autumnV1, autumnV2, ctx, testClockId, customer, entities
 *
 * @example
 * ```typescript
 * // Simple test
 * const { autumnV1, ctx } = await initScenario({
 *   customerId: "simple-test",
 *   setup: [
 *     s.customer({ paymentMethod: "success" }),
 *     s.products({ list: [free] }),
 *   ],
 *   actions: [
 *     s.attach({ productId: "base" }),
 *   ],
 * });
 *
 * // With entities
 * const { autumnV1, ctx, entities } = await initScenario({
 *   customerId: "entity-test",
 *   setup: [
 *     s.customer({ paymentMethod: "success" }),
 *     s.products({ list: [pro, free] }),
 *     s.entities({ count: 2, featureId: TestFeature.Users }),
 *   ],
 *   actions: [
 *     s.attach({ productId: "pro", entityIndex: 0 }),
 *     s.attach({ productId: "free", entityIndex: 1 }),
 *   ],
 * });
 * // entities[0].id = "ent-1", entities[1].id = "ent-2"
 * ```
 */
export const initScenario = async ({
	customerId,
	setup,
	actions,
}: {
	customerId: string;
	setup: ConfigFn[];
	actions: ConfigFn[];
}) => {
	// Build config from setup and actions
	const config = [...setup, ...actions].reduce((c, fn) => fn(c), defaultConfig);

	// Generate entities from config
	const generatedEntities = config.entityConfig
		? generateEntities(config.entityConfig)
		: [];

	// 1. Initialize products & delete previous customers (prefix = customerId for isolation)
	if (config.products.length > 0) {
		await initProductsV0({
			ctx,
			products: config.products,
			prefix: customerId,
			customerIds: config.customerIds,
		});
	}

	// 2. Initialize customer
	const { testClockId, customer } = await initCustomerV3({
		ctx,
		customerId,
		customerData: config.customerData,
		attachPm: config.attachPm,
		withTestClock: config.testClock,
		withDefault: config.withDefault,
	});

	// 3. Create autumn clients
	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	// 4. Create entities if any
	if (generatedEntities.length > 0) {
		const entityDefs = generatedEntities.map((e) => ({
			id: e.id,
			name: e.name,
			feature_id: e.featureId,
		}));
		await autumnV1.entities.create(customerId, entityDefs);
	}

	// 5. Attach products
	for (const attachment of config.attachments) {
		const prefixedProductId = `${attachment.productId}_${customerId}`;

		// Resolve entityIndex to entityId
		let entityId: string | undefined;
		if (attachment.entityIndex !== undefined) {
			if (attachment.entityIndex >= generatedEntities.length) {
				throw new Error(
					`entityIndex ${attachment.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
				);
			}
			entityId = generatedEntities[attachment.entityIndex].id;
		}

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prefixedProductId,
			entity_id: entityId,
			options: attachment.options,
			new_billing_subscription: attachment.newBillingSubscription,
		});
	}

	// 6. Cancel products if configured
	for (const cancellation of config.cancellations) {
		const prefixedProductId = `${cancellation.productId}_${customerId}`;

		// Resolve entityIndex to entityId
		let entityId: string | undefined;
		if (cancellation.entityIndex !== undefined) {
			if (cancellation.entityIndex >= generatedEntities.length) {
				throw new Error(
					`entityIndex ${cancellation.entityIndex} is out of bounds. Only ${generatedEntities.length} entities configured.`,
				);
			}
			entityId = generatedEntities[cancellation.entityIndex].id;
		}

		await autumnV1.cancel({
			customer_id: customerId,
			product_id: prefixedProductId,
			entity_id: entityId,
		});
	}

	// 7. Advance test clock if configured
	let advancedTo: number | undefined;
	if (config.advanceClock && testClockId) {
		if (config.advanceClock.toNextInvoice) {
			// Advance to next month + hours to finalize invoice
			advancedTo = await advanceTestClockFn({
				stripeCli: ctx.stripeCli,
				testClockId,
				advanceTo: addHours(
					addMonths(new Date(), 1),
					hoursToFinalizeInvoice,
				).getTime(),
				waitForSeconds: 30,
			});
		} else {
			advancedTo = await advanceTestClockFn({
				stripeCli: ctx.stripeCli,
				testClockId,
				numberOfDays: config.advanceClock.days,
				numberOfWeeks: config.advanceClock.weeks,
				numberOfHours: config.advanceClock.hours,
				numberOfMonths: config.advanceClock.months,
			});
		}
	}

	return {
		customerId,
		autumnV1,
		autumnV2,
		testClockId,
		customer,
		ctx,
		entities: generatedEntities,
		advancedTo,
	};
};
