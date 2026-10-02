import { describe, expect, test } from "bun:test";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { validateSetPlansPhasePlans } from "@/internal/billing/v2/actions/setPlans/errors/validateSetPlansPhasePlans";

const recurringProduct = ({
	id,
	group = "",
}: {
	id: string;
	group?: string;
}) => ({
	...products.createFull({
		id,
		prices: [prices.createFixed({ id: `price_${id}` })],
	}),
	group,
});

describe(chalk.yellowBright("validateSetPlansPhasePlans"), () => {
	test("allows plans in different groups even when each would replace a current plan", () => {
		const productA = recurringProduct({ id: "replacement-a" });
		const productB = recurringProduct({
			id: "replacement-b",
			group: "group-b",
		});

		expect(() =>
			validateSetPlansPhasePlans({
				plans: [{ fullProduct: productA }, { fullProduct: productB }],
			}),
		).not.toThrow();
	});

	test("allows plans in the same group on different scopes", () => {
		const productA = recurringProduct({ id: "entity-a-plan" });
		const productB = recurringProduct({ id: "entity-b-plan" });

		expect(() =>
			validateSetPlansPhasePlans({
				plans: [
					{ fullProduct: productA, scopeId: "entity-a" },
					{ fullProduct: productB, scopeId: "entity-b" },
				],
			}),
		).not.toThrow();
	});

	test("rejects multiple main recurring plans in the same group", () => {
		const productA = recurringProduct({ id: "replacement-a" });
		const productB = recurringProduct({ id: "replacement-b" });

		expect(() =>
			validateSetPlansPhasePlans({
				plans: [
					{ fullProduct: productA, scopeId: "entity-a" },
					{ fullProduct: productB, scopeId: "entity-a" },
				],
			}),
		).toThrow("at most one plan per group and scope");
	});
});
