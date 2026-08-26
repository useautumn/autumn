import { expect, test } from "bun:test";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	expectPerCustomerLaneWithRejections,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const familyItems = [itemsV2.dashboard()];

const versionOperation = ({
	planFilter,
	version,
}: {
	planFilter: PlanFilter;
	version: number;
}) => ({
	type: "update_plan" as const,
	plan_filter: planFilter,
	version,
});

const createNextVersion = async ({
	autumnV2_3,
	planId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) =>
	autumnV2_3.post("/plans.update", {
		plan_id: planId,
		force_version: true,
		items: familyItems,
	});

const setupVariantFamily = async ({ prefix }: { prefix: string }) => {
	const baseCustomerId = `${prefix}-base-customer`;
	const variantCustomerId = `${prefix}-variant-customer`;
	const siblingCustomerId = `${prefix}-sibling-customer`;
	const base = products.base({ id: `${prefix}-base`, items: familyItems });
	const { autumnV2_3, ctx } = await initScenario({
		customerId: baseCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: variantCustomerId }, { id: siblingCustomerId }]),
			s.products({ list: [base] }),
		],
		actions: [],
	});
	const variantId = `${prefix}-variant`;
	const siblingId = `${prefix}-sibling`;
	// Variant plans outlive initScenario's product reset; drop leftovers first.
	for (const planId of [variantId, siblingId]) {
		await autumnV2_3
			.post("/plans.delete", { plan_id: planId, all_versions: true })
			.catch(() => {});
	}
	await autumnV2_3.post("/plans.create_variant", {
		base_plan_id: base.id,
		variant_plan_id: variantId,
		name: "Variant",
	});
	await autumnV2_3.post("/plans.create_variant", {
		base_plan_id: base.id,
		variant_plan_id: siblingId,
		name: "Sibling",
	});
	for (const [customerId, planId] of [
		[baseCustomerId, base.id],
		[variantCustomerId, variantId],
		[siblingCustomerId, siblingId],
	] as const) {
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});
	}
	return {
		autumnV2_3,
		ctx,
		baseCustomerId,
		variantCustomerId,
		siblingCustomerId,
		baseId: base.id,
		variantId,
		siblingId,
	};
};

test.skip(
	`${chalk.yellowBright("batch version repoint variants: base migration leaves variants untouched")}`,
	async () => {
		const prefix = "repoint-variant-base-only";
		const scenario = await setupVariantFamily({ prefix });
		const baseBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.baseCustomerId,
			planId: scenario.baseId,
		});
		const variantBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.variantCustomerId,
			planId: scenario.variantId,
		});
		const siblingBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.siblingCustomerId,
			planId: scenario.siblingId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.baseId,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: {
						$in: [
							scenario.baseCustomerId,
							scenario.variantCustomerId,
							scenario.siblingCustomerId,
						],
					},
				},
			},
			operations: {
				customer: [
					versionOperation({
						planFilter: { plan_id: scenario.baseId, custom: false },
						version: 2,
					}),
				],
			},
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before: baseBefore,
			after: await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.baseCustomerId,
				planId: scenario.baseId,
			}),
			targetVersion: 2,
		});
		for (const [customerId, planId, before] of [
			[scenario.variantCustomerId, scenario.variantId, variantBefore],
			[scenario.siblingCustomerId, scenario.siblingId, siblingBefore],
		] as const) {
			expect(
				await readRepointableCustomerPlanRow({
					ctx: scenario.ctx,
					customerId,
					planId,
				}),
			).toEqual(before);
		}
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint variants: variant migration leaves base and sibling untouched")}`,
	async () => {
		const prefix = "repoint-variant-one-only";
		const scenario = await setupVariantFamily({ prefix });
		const baseBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.baseCustomerId,
			planId: scenario.baseId,
		});
		const variantBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.variantCustomerId,
			planId: scenario.variantId,
		});
		const siblingBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.siblingCustomerId,
			planId: scenario.siblingId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.variantId,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: {
						$in: [
							scenario.baseCustomerId,
							scenario.variantCustomerId,
							scenario.siblingCustomerId,
						],
					},
				},
			},
			operations: {
				customer: [
					versionOperation({
						planFilter: { plan_id: scenario.variantId, custom: false },
						version: 2,
					}),
				],
			},
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before: variantBefore,
			after: await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.variantCustomerId,
				planId: scenario.variantId,
			}),
			targetVersion: 2,
		});
		expect(
			await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.baseCustomerId,
				planId: scenario.baseId,
			}),
		).toEqual(baseBefore);
		expect(
			await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.siblingCustomerId,
				planId: scenario.siblingId,
			}),
		).toEqual(siblingBefore);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint variants: one operation can target base and variant explicitly")}`,
	async () => {
		const prefix = "repoint-variant-combined";
		const scenario = await setupVariantFamily({ prefix });
		const before = await Promise.all(
			[
				[scenario.baseCustomerId, scenario.baseId],
				[scenario.variantCustomerId, scenario.variantId],
			].map(
				async ([customerId, planId]) =>
					[
						customerId,
						planId,
						await readRepointableCustomerPlanRow({
							ctx: scenario.ctx,
							customerId,
							planId,
						}),
					] as const,
			),
		);
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.baseId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.variantId,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: {
						$in: [scenario.baseCustomerId, scenario.variantCustomerId],
					},
				},
			},
			operations: {
				customer: [
					versionOperation({
						planFilter: {
							plan_id: { $in: [scenario.baseId, scenario.variantId] },
							custom: false,
						},
						version: 2,
					}),
				],
			},
		});
		expectBatchLane({ result });
		for (const [customerId, planId, rowBefore] of before) {
			expectCustomerPlanRepointedInPlace({
				before: rowBefore,
				after: await readRepointableCustomerPlanRow({
					ctx: scenario.ctx,
					customerId,
					planId,
				}),
				targetVersion: 2,
			});
		}
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint variants: each explicit target resolves its own plan and version")}`,
	async () => {
		const prefix = "repoint-variant-independent";
		const scenario = await setupVariantFamily({ prefix });
		const baseBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.baseCustomerId,
			planId: scenario.baseId,
		});
		const variantBefore = await readRepointableCustomerPlanRow({
			ctx: scenario.ctx,
			customerId: scenario.variantCustomerId,
			planId: scenario.variantId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.baseId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.variantId,
		});
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.variantId,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: {
						$in: [scenario.baseCustomerId, scenario.variantCustomerId],
					},
				},
			},
			operations: {
				customer: [
					versionOperation({
						planFilter: { plan_id: scenario.baseId, custom: false },
						version: 2,
					}),
					versionOperation({
						planFilter: { plan_id: scenario.variantId, custom: false },
						version: 3,
					}),
				],
			},
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before: baseBefore,
			after: await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.baseCustomerId,
				planId: scenario.baseId,
			}),
			targetVersion: 2,
		});
		expectCustomerPlanRepointedInPlace({
			before: variantBefore,
			after: await readRepointableCustomerPlanRow({
				ctx: scenario.ctx,
				customerId: scenario.variantCustomerId,
				planId: scenario.variantId,
			}),
			targetVersion: 3,
		});
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint variants: one missing target falls the whole migration back")}`,
	async () => {
		const prefix = "repoint-variant-missing-target";
		const scenario = await setupVariantFamily({ prefix });
		await createNextVersion({
			autumnV2_3: scenario.autumnV2_3,
			planId: scenario.baseId,
		});

		const { result } = await runVersionRepointMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: {
				customer: {
					customer_id: {
						$in: [scenario.baseCustomerId, scenario.variantCustomerId],
					},
				},
			},
			operations: {
				customer: [
					versionOperation({
						planFilter: {
							plan_id: { $in: [scenario.baseId, scenario.variantId] },
							custom: false,
						},
						version: 2,
					}),
				],
			},
		});
		expectPerCustomerLaneWithRejections({
			result,
			codes: ["missing_target_version"],
		});
		expect(result?.rejections?.every(({ opIndex }) => opIndex === 0)).toBe(
			true,
		);
	},
);
