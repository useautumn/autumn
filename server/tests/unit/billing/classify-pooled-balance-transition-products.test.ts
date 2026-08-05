/**
 * TDD test for `duplicate key value violates unique constraint
 * "unique_pooled_balance_contribution"` on customer.subscription.updated
 * (7 mintlify customers, early-acked then failing on webhook replay).
 *
 * syncCustomerProductStatus writes `status: Active` when a product recovers
 * from past_due. applyPooledBalanceTransitions treated ANY status write of
 * Active as an incoming attachment, so a product that had been contributing
 * since attach got a second contribution planned for the same source
 * entitlement — which the unique index rejects.
 *
 * Scope: this covers the CLASSIFICATION only. Driving a real past_due -> active
 * recovery through Stripe test clocks is slow and flaky, so the webhook is not
 * exercised end to end here.
 *
 * Red-failure mode (current behavior):
 *  - a past_due product with `updates.status = Active` is classified incoming.
 *
 * Green-success criteria (after fix):
 *  - it is not incoming; a Scheduled -> Active product still is, and expiry
 *    and inserted products are unaffected.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import chalk from "chalk";
import { classifyPooledBalanceTransitionProducts } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/classifyPooledBalanceTransitionProducts";

const customerProduct = ({
	id,
	status,
}: {
	id: string;
	status: CusProductStatus;
}) => ({ id, status }) as FullCusProduct;

const incomingIds = (
	result: ReturnType<typeof classifyPooledBalanceTransitionProducts>,
) => result.incomingCustomerProducts.map((product) => product.id).sort();

const outgoingIds = (
	result: ReturnType<typeof classifyPooledBalanceTransitionProducts>,
) => result.outgoingCustomerProducts.map((product) => product.id).sort();

test(
	chalk.yellowBright(
		"pooled transitions: a past_due -> active recovery is not an incoming attachment",
	),
	() => {
		const result = classifyPooledBalanceTransitionProducts({
			updatedCustomerProducts: [
				{
					customerProduct: customerProduct({
						id: "cus_prod_recovered",
						status: CusProductStatus.PastDue,
					}),
					updates: { status: CusProductStatus.Active },
				},
			],
			insertedCustomerProducts: [],
		});

		expect(incomingIds(result)).toEqual([]);
		expect(outgoingIds(result)).toEqual([]);
	},
);

test(
	chalk.yellowBright(
		"pooled transitions: an active -> active status write is not an incoming attachment",
	),
	() => {
		const result = classifyPooledBalanceTransitionProducts({
			updatedCustomerProducts: [
				{
					customerProduct: customerProduct({
						id: "cus_prod_already_active",
						status: CusProductStatus.Active,
					}),
					updates: { status: CusProductStatus.Active },
				},
			],
			insertedCustomerProducts: [],
		});

		expect(incomingIds(result)).toEqual([]);
	},
);

test(
	chalk.yellowBright(
		"pooled transitions: a scheduled -> active activation IS an incoming attachment",
	),
	() => {
		const result = classifyPooledBalanceTransitionProducts({
			updatedCustomerProducts: [
				{
					customerProduct: customerProduct({
						id: "cus_prod_scheduled",
						status: CusProductStatus.Scheduled,
					}),
					updates: { status: CusProductStatus.Active },
				},
			],
			insertedCustomerProducts: [],
		});

		expect(incomingIds(result)).toEqual(["cus_prod_scheduled"]);
	},
);

test(
	chalk.yellowBright(
		"pooled transitions: expiry and inserted products are classified as before",
	),
	() => {
		const result = classifyPooledBalanceTransitionProducts({
			updatedCustomerProducts: [
				{
					customerProduct: customerProduct({
						id: "cus_prod_expiring",
						status: CusProductStatus.Active,
					}),
					updates: { status: CusProductStatus.Expired },
				},
			],
			insertedCustomerProducts: [
				customerProduct({
					id: "cus_prod_inserted",
					status: CusProductStatus.Active,
				}),
				customerProduct({
					id: "cus_prod_inserted_scheduled",
					status: CusProductStatus.Scheduled,
				}),
			],
		});

		expect(outgoingIds(result)).toEqual(["cus_prod_expiring"]);
		// Scheduled inserts are not yet contributing, so they stay out.
		expect(incomingIds(result)).toEqual(["cus_prod_inserted"]);
	},
);
