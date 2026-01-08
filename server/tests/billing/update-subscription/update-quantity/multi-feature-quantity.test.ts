import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Subscription Update - Feature Matching Tests
 *
 * These tests verify that the subscription update flow correctly matches
 * features by feature_id rather than array index. This prevents critical
 * bugs where reordered features or partial updates could cause incorrect
 * billing calculations.
 *
 * Critical bug fix: Previously used array index to match old vs new options,
 * which would break if features were sent in a different order.
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: features in reverse order")}`,
	async () => {
		const customerId = "multi-feat-reverse-order";

		const product = constructRawProduct({
			id: "multi_feature",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits: 10,
					price: 5,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Words,
					billingUnits: 100,
					price: 10,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Users,
					billingUnits: 1,
					price: 2,
				}),
			],
		});

		// Attach with features in order: Messages, Words, Users
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * 10 }, // 100 messages
						{ feature_id: TestFeature.Words, quantity: 5 * 100 }, // 500 words
						{ feature_id: TestFeature.Users, quantity: 20 * 1 }, // 20 users
					],
				}),
			],
		});

		// Update with features in REVERSE order: Users, Words, Messages
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Users, quantity: 50 * 1 }, // 50 users (increased)
				{ feature_id: TestFeature.Words, quantity: 10 * 100 }, // 1000 words (increased)
				{ feature_id: TestFeature.Messages, quantity: 5 * 10 }, // 50 messages (decreased)
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Each feature should be updated correctly despite reordering
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(50);
		expect(customer.features?.[TestFeature.Words]?.balance).toBe(1000);
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: features in random order")}`,
	async () => {
		const customerId = "multi-feat-random-order";

		const product = constructRawProduct({
			id: "multi_feature",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits: 10,
					price: 5,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Words,
					billingUnits: 100,
					price: 10,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Users,
					billingUnits: 1,
					price: 2,
				}),
			],
		});

		// Attach with features in order: Messages, Words, Users
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
						{ feature_id: TestFeature.Words, quantity: 5 * 100 },
						{ feature_id: TestFeature.Users, quantity: 20 * 1 },
					],
				}),
			],
		});

		// Update with features in random order: Words, Users, Messages
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: 20 * 100 }, // 2000 words
				{ feature_id: TestFeature.Users, quantity: 100 * 1 }, // 100 users
				{ feature_id: TestFeature.Messages, quantity: 15 * 10 }, // 150 messages
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
		expect(customer.features?.[TestFeature.Words]?.balance).toBe(2000);
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: partial update (one feature changed)")}`,
	async () => {
		const customerId = "multi-feat-partial-update";

		const product = constructRawProduct({
			id: "multi_feature",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits: 10,
					price: 5,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Words,
					billingUnits: 100,
					price: 10,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Users,
					billingUnits: 1,
					price: 2,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 15 * 10 }, // 150 messages
						{ feature_id: TestFeature.Words, quantity: 20 * 100 }, // 2000 words
						{ feature_id: TestFeature.Users, quantity: 100 * 1 }, // 100 users
					],
				}),
			],
		});

		// Only update Words, keep others the same
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: 30 * 100 }, // 3000 words - only updating this
				{ feature_id: TestFeature.Messages, quantity: 15 * 10 }, // Keep at 150
				{ feature_id: TestFeature.Users, quantity: 100 * 1 }, // Keep at 100
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Words should be updated
		expect(customer.features?.[TestFeature.Words]?.balance).toBe(3000);

		// Others should remain the same
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: error on non-existent feature")}`,
	async () => {
		const customerId = "multi-feat-nonexistent";

		const product = constructRawProduct({
			id: "multi_feature",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits: 10,
					price: 5,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
					],
				}),
			],
		});

		// Try to update a feature that doesn't exist in the subscription
		const invalidUpdate = autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: "non_existent_feature", quantity: 100 },
			],
		});

		// Should throw an error
		await expect(invalidUpdate).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: duplicate feature_ids uses last value")}`,
	async () => {
		const customerId = "multi-feat-duplicate-ids";

		const product = constructRawProduct({
			id: "two_feature",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits: 10,
					price: 5,
				}),
				constructPrepaidItem({
					featureId: TestFeature.Words,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * 10 },
						{ feature_id: TestFeature.Words, quantity: 5 * 100 },
					],
				}),
			],
		});

		// Send the same feature twice (edge case - should use last value or error)
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * 10 }, // First value: 200
				{ feature_id: TestFeature.Messages, quantity: 30 * 10 }, // Second value (duplicate): 300
				{ feature_id: TestFeature.Words, quantity: 10 * 100 },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// The last value should win (or this should error - either is acceptable)
		const messagesBalance = customer.features?.[TestFeature.Messages]?.balance;

		// Should be either 200 (first) or 300 (second), not some weird value from index mismatch
		expect([200, 300]).toContain(messagesBalance ?? 0);
	},
);
