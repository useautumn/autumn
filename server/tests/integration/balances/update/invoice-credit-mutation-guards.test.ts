import { expect, test } from "bun:test";
import { type ApiCustomer, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const errorMessage =
	"Invoice-credit balances can only be changed through tracked usage and billing-cycle resets";

test.concurrent(
	"invoice-credit balances reject source-less mutations but allow metadata updates",
	async () => {
		const product = products.base({
			id: "invoice-credit-mutation-guards",
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: 100,
					price: 1,
					billingUnits: 1,
				}),
			],
		});
		const { autumnV2, customerId } = await initScenario({
			customerId: "invoice-credit-mutation-guards",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({ productId: product.id }),
				s.track({ featureId: TestFeature.Action1, value: 50 }),
			],
		});

		const expectRejected = (func: () => Promise<unknown>) =>
			expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: errorMessage,
				func,
			});

		for (const mutation of [
			{ remaining: 70 },
			{ remaining: 110 },
			{ add_to_balance: 10 },
			{ add_to_balance: -10 },
			{ usage: 30 },
			{ included_grant: 200 },
		]) {
			await expectRejected(() =>
				autumnV2.balances.update({
					customer_id: customerId,
					feature_id: TestFeature.InvoiceCredits,
					...mutation,
				}),
			);
		}

		await expectRejected(() =>
			autumnV2.usage({
				customer_id: customerId,
				feature_id: TestFeature.InvoiceCredits,
				value: 30,
			}),
		);
		await expectRejected(() =>
			autumnV2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.InvoiceCredits,
				included_grant: 50,
			}),
		);
		await expectRejected(() =>
			autumnV2.balances.delete({
				customer_id: customerId,
				feature_id: TestFeature.InvoiceCredits,
			}),
		);
		await expectRejected(() =>
			autumnV2.balances.recalculate({
				customer_id: customerId,
				feature_id: TestFeature.InvoiceCredits,
			}),
		);
		await expectRejected(() =>
			autumnV2.balances.previewRecalculate({
				customer_id: customerId,
				feature_id: TestFeature.InvoiceCredits,
			}),
		);

		const nextResetAt = Date.now() + 24 * 60 * 60 * 1000;
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.InvoiceCredits,
			next_reset_at: nextResetAt,
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.InvoiceCredits,
			expires_at: nextResetAt + 24 * 60 * 60 * 1000,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.InvoiceCredits]).toMatchObject({
			granted_balance: 100,
			current_balance: 90,
			usage: 10,
		});
	},
);
