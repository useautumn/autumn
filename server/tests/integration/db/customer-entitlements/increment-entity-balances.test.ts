import { describe, expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { buildLooseEntityEntitlementScenario } from "../full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../full-subject/utils/withInsertedScenario.js";

const readEntities = async ({ id }: { id: string }) => {
	const [row] = await ctx.db
		.select({ entities: customerEntitlements.entities })
		.from(customerEntitlements)
		.where(eq(customerEntitlements.id, id));
	return row?.entities ?? null;
};

describe(`${chalk.yellowBright("CusEntService.moveEntityBalances")}`, () => {
	test("re-keys an entry with its id, keeps its fields, ignores a missing key", async () => {
		const scenario = buildLooseEntityEntitlementScenario({
			ctx,
			name: "move-entity-balances",
		});
		const customerEntitlement = scenario.customerEntitlements[0];

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				await CusEntService.update({
					ctx,
					id: customerEntitlement.id,
					updates: {
						entities: {
							rep_1: { id: "rep_1", balance: 120, adjustment: 7 },
							u2: { id: "u2", balance: 500, adjustment: 0 },
						},
					},
				});

				await CusEntService.moveEntityBalances({
					ctx,
					id: customerEntitlement.id,
					moves: { rep_1: "u1", rep_missing: "u3" },
				});
				expect(await readEntities({ id: customerEntitlement.id })).toEqual({
					u1: { id: "u1", balance: 120, adjustment: 7 },
					u2: { id: "u2", balance: 500, adjustment: 0 },
				});
			},
		});
	});
});

describe(`${chalk.yellowBright("CusEntService.incrementEntityBalances")}`, () => {
	test("seeds missing keys from a null map, then increments and keeps other fields", async () => {
		const scenario = buildLooseEntityEntitlementScenario({
			ctx,
			name: "increment-entity-balances",
		});
		const customerEntitlement = scenario.customerEntitlements[0];

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				await CusEntService.incrementEntityBalances({
					ctx,
					id: customerEntitlement.id,
					changes: { u1: 500, u2: 500 },
				});
				expect(await readEntities({ id: customerEntitlement.id })).toEqual({
					u1: { id: "u1", balance: 500, adjustment: 0 },
					u2: { id: "u2", balance: 500, adjustment: 0 },
				});

				await CusEntService.update({
					ctx,
					id: customerEntitlement.id,
					updates: {
						entities: {
							u1: {
								id: "u1",
								balance: 120,
								adjustment: 7,
								additional_balance: 3,
							},
							u2: { id: "u2", balance: 500, adjustment: 0 },
						},
					},
				});

				await CusEntService.incrementEntityBalances({
					ctx,
					id: customerEntitlement.id,
					changes: { u1: -20, u3: 500 },
				});
				expect(await readEntities({ id: customerEntitlement.id })).toEqual({
					u1: { id: "u1", balance: 100, adjustment: 7, additional_balance: 3 },
					u2: { id: "u2", balance: 500, adjustment: 0 },
					u3: { id: "u3", balance: 500, adjustment: 0 },
				});
			},
		});
	});
});
