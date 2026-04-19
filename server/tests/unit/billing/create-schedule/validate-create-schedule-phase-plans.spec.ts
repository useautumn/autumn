import { describe, expect, test } from "bun:test";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { validateCreateSchedulePhasePlans } from "@/internal/billing/v2/actions/createSchedule/errors/validateCreateSchedulePhasePlans";

describe(chalk.yellowBright("validateCreateSchedulePhasePlans"), () => {
	test("allows plans in different groups even when each would replace a current plan", () => {
		const productA = products.createFull({
			id: "replacement-a",
			prices: [prices.createFixed({ id: "price_replacement_a" })],
		});
		const productB = {
			...products.createFull({
				id: "replacement-b",
				prices: [prices.createFixed({ id: "price_replacement_b" })],
			}),
			group: "group-b",
		};

		expect(() =>
			validateCreateSchedulePhasePlans({
				fullProducts: [productA, productB],
			}),
		).not.toThrow();
	});

	test("rejects multiple main recurring plans in the same group", () => {
		const productA = products.createFull({
			id: "replacement-a",
			prices: [prices.createFixed({ id: "price_same_group_a" })],
		});
		const productB = products.createFull({
			id: "replacement-b",
			prices: [prices.createFixed({ id: "price_same_group_b" })],
		});

		expect(() =>
			validateCreateSchedulePhasePlans({
				fullProducts: [productA, productB],
			}),
		).toThrow("at most one plan per group");
	});
});
