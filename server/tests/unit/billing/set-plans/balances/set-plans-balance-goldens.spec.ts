import { describe, expect, test } from "bun:test";
import { entities } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import {
	describeBalancePhases,
	included,
	NOW,
	oneOffPrepaid,
	PHASE_TWO,
	payPerUse,
	planRow,
	previewBalanceChanges,
	scheduledRow,
} from "./balanceFixtures";

const proWithCredits = () =>
	planRow({
		planId: "pro",
		balances: [
			included({ featureId: "words", allowance: 1000 }),
			oneOffPrepaid({ featureId: "credits", quantity: 500, usage: 200 }),
		],
	});

describe(
	chalk.yellowBright("set_plans balance preview: one-off prepaid"),
	() => {
		test("replacing a plan now keeps its unused one-off credits", async () => {
			const pro = proWithCredits();
			const premium = planRow({
				planId: "premium",
				rowId: "cp_premium",
				startsAt: NOW,
				balances: [included({ featureId: "words", allowance: 2000 })],
			});

			const phaseChanges = await previewBalanceChanges({
				current: [pro],
				inserts: [premium],
				expirations: [pro],
				phases: [{ startsAt: NOW, customerProductIds: [premium.id] }],
			});

			expect(describeBalancePhases(phaseChanges)).toEqual([
				[
					"words updated (request): 1000 -> 2000 granted, 2000 left",
					"credits carried (request): 500 -> 300 granted, 300 left",
				],
			]);
		});

		test("a plan ending at a later phase keeps its unused one-off credits", async () => {
			const pro = proWithCredits();
			const premium = scheduledRow({
				planId: "premium",
				startsAt: PHASE_TWO,
				balances: [included({ featureId: "words", allowance: 2000 })],
			});

			const phaseChanges = await previewBalanceChanges({
				current: [pro],
				inserts: [premium],
				endings: [{ customerProduct: pro, endedAt: PHASE_TWO }],
				phases: [
					{ startsAt: NOW, customerProductIds: [pro.id] },
					{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
				],
			});

			expect(describeBalancePhases(phaseChanges)).toEqual([
				[],
				[
					"words updated (request): 1000 -> 2000 granted, 2000 left",
					"credits carried (request): 500 -> 300 granted, 300 left",
				],
			]);
		});
	},
);

describe(chalk.yellowBright("set_plans balance preview: scope"), () => {
	const entityA = entities.create({ id: "ent_a", featureId: "users" });
	const entityB = entities.create({ id: "ent_b", featureId: "users" });

	test("opposite changes on two entities are each listed, not summed away", async () => {
		const proOnA = planRow({
			planId: "pro",
			rowId: "cp_pro_a",
			internalEntityId: entityA.internal_id,
			balances: [included({ featureId: "words", allowance: 1000 })],
		});
		const premiumOnB = planRow({
			planId: "premium",
			rowId: "cp_premium_b",
			internalEntityId: entityB.internal_id,
			balances: [included({ featureId: "words", allowance: 2000 })],
		});
		const premiumOnA = planRow({
			planId: "premium",
			rowId: "cp_premium_a",
			startsAt: NOW,
			internalEntityId: entityA.internal_id,
			balances: [included({ featureId: "words", allowance: 2000 })],
		});
		const proOnB = planRow({
			planId: "pro",
			rowId: "cp_pro_b",
			startsAt: NOW,
			internalEntityId: entityB.internal_id,
			balances: [included({ featureId: "words", allowance: 1000 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [proOnA, premiumOnB],
			inserts: [premiumOnA, proOnB],
			expirations: [proOnA, premiumOnB],
			phases: [
				{ startsAt: NOW, customerProductIds: [premiumOnA.id, proOnB.id] },
			],
			customerEntities: [entityA, entityB],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([
			[
				"ent_a/words updated (request): 1000 -> 2000 granted, 2000 left",
				"ent_b/words updated (request): 2000 -> 1000 granted, 1000 left",
			],
		]);
	});

	test("an entity's new add-on is listed under that entity only", async () => {
		const customerPro = planRow({
			planId: "pro",
			balances: [included({ featureId: "words", allowance: 1000 })],
		});
		const wordsAddonOnA = planRow({
			planId: "words_addon",
			rowId: "cp_words_addon_a",
			isAddOn: true,
			startsAt: NOW,
			internalEntityId: entityA.internal_id,
			balances: [included({ featureId: "words", allowance: 500 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [customerPro],
			inserts: [wordsAddonOnA],
			phases: [
				{
					startsAt: NOW,
					customerProductIds: [customerPro.id, wordsAddonOnA.id],
				},
			],
			customerEntities: [entityA],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([
			["ent_a/words added (request): 0 -> 500 granted, 500 left"],
		]);
	});
});

describe(chalk.yellowBright("set_plans balance preview: origin"), () => {
	const savedSwitch = () => {
		const pro = planRow({
			planId: "pro",
			endedAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 1000 })],
		});
		const enterprise = scheduledRow({
			planId: "enterprise",
			startsAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 3000 })],
		});
		return { pro, enterprise };
	};

	test("re-sending a saved schedule unchanged marks its later change as saved", async () => {
		const { pro, enterprise } = savedSwitch();

		const phaseChanges = await previewBalanceChanges({
			current: [pro, enterprise],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [enterprise.id] },
			],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([
			[],
			["words updated (saved): 1000 -> 3000 granted, 3000 left"],
		]);
	});

	test("changing the first phase makes the saved later change the request's", async () => {
		const { pro, enterprise } = savedSwitch();
		const premium = planRow({
			planId: "premium",
			rowId: "cp_premium",
			startsAt: NOW,
			endedAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 2000 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro, enterprise],
			inserts: [premium],
			expirations: [pro],
			phases: [
				{ startsAt: NOW, customerProductIds: [premium.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [enterprise.id] },
			],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([
			["words updated (request): 1000 -> 2000 granted, 2000 left"],
			["words updated (request): 2000 -> 3000 granted, 3000 left"],
		]);
	});

	test("replacing the saved later plan makes its change the request's", async () => {
		const { pro, enterprise } = savedSwitch();
		const team = scheduledRow({
			planId: "team",
			startsAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 5000 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro, enterprise],
			inserts: [team],
			deletes: [enterprise],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [team.id] },
			],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([
			[],
			["words updated (request): 1000 -> 5000 granted, 5000 left"],
		]);
	});
});

describe(chalk.yellowBright("set_plans balance preview: projection"), () => {
	test("a pay-per-use add-on reads as added", async () => {
		const pro = planRow({
			planId: "pro",
			balances: [included({ featureId: "words", allowance: 1000 })],
		});
		const apiAddon = planRow({
			planId: "api_addon",
			rowId: "cp_api_addon",
			isAddOn: true,
			startsAt: NOW,
			balances: [payPerUse({ featureId: "api_calls" })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			inserts: [apiAddon],
			phases: [{ startsAt: NOW, customerProductIds: [pro.id, apiAddon.id] }],
		});

		expect(
			phaseChanges[0]?.map(({ feature_id, behavior, balance }) => [
				feature_id,
				behavior,
				balance.overage_allowed,
			]),
		).toEqual([["api_calls", "added", true]]);
	});

	test("a plan that continues into a later phase doesn't carry its own usage onto itself", async () => {
		const pro = planRow({
			planId: "pro",
			balances: [included({ featureId: "seats", allowance: 5, usage: 3 })],
		});

		const phaseChanges = await previewBalanceChanges({
			current: [pro],
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [pro.id] },
			],
		});

		expect(describeBalancePhases(phaseChanges)).toEqual([[], []]);
	});
});
