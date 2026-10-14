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
		expect(incomingIds(result)).toEqual(["cus_prod_inserted"]);
	},
);
