/**
 * catalogV2.preview_update — item_changes + customize.add_items/remove_items.
 *
 * RED: changes stubbed null. Match key = feature_id|billing_method|interval|
 * interval_count. In-place mods = remove filter (OLD key) + add entry.
 * toCreatePlanItemParams omits default-valued fields.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	PreviewUpdateCatalogResponseSchema,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	findPlanPreviewRow,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

const messagesFree = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const messagesPrepaid = ({
	amount,
	interval = BillingInterval.Month,
}: {
	amount: number;
	interval?: BillingInterval;
}) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount,
		interval,
		billing_method: BillingMethod.Prepaid,
		billing_units: 1,
	},
	reset: { interval: ResetInterval.Month },
});

const messagesUsage = ({
	amount,
	interval = BillingInterval.Month,
}: {
	amount: number;
	interval?: BillingInterval;
}) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount,
		interval,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
	reset: { interval },
});

/** Assert changes wired with expected customize item lanes. */
const expectItemCustomize = ({
	preview,
	planId,
	addItems,
	removeItems,
}: {
	preview: ReturnType<typeof parsePlanPreview>;
	planId: string;
	addItems?: unknown;
	removeItems?: unknown;
}) => {
	const row = findPlanPreviewRow({ preview, planId });
	expect(row.changes, "changes must be non-null").not.toBeNull();
	if (addItems !== undefined) {
		expect(row.changes?.customize?.add_items).toEqual(addItems as never);
	}
	if (removeItems !== undefined) {
		expect(row.changes?.customize?.remove_items).toEqual(removeItems as never);
	}
};

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: add free item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_addf");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Add Free" }],
			});
			const item = messagesFree(10);
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [item] }],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "update" },
			});
			expectItemCustomize({
				preview,
				planId,
				addItems: [
					{
						feature_id: TestFeature.Messages,
						included: 10,
						reset: { interval: ResetInterval.Month },
					},
				],
				removeItems: undefined,
			});
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.changes?.customize?.remove_items).toBeUndefined();
			expect(row.changes?.item_changes).toEqual([
				expect.objectContaining({
					action: "created",
					feature_id: TestFeature.Messages,
				}),
			]);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, featureIds: [] }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: add priced item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_addp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Add Priced" }],
			});
			const item = messagesPrepaid({ amount: 5 });
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [item] }],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				addItems: [
					expect.objectContaining({
						feature_id: TestFeature.Messages,
						price: expect.objectContaining({
							amount: 5,
							billing_method: BillingMethod.Prepaid,
						}),
					}),
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.changes?.item_changes?.[0]?.action).toBe("created");
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: remove item → deleted + remove_items filter")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Remove",
						items: [messagesFree(10)],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [] }],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				addItems: undefined,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.changes?.customize?.add_items).toBeUndefined();
			expect(row.changes?.item_changes).toEqual([
				expect.objectContaining({
					action: "deleted",
					feature_id: TestFeature.Messages,
				}),
			]);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — same match key → deleted+created pair
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: included bump → remove+add same key")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_inc");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Inc",
						items: [messagesFree(10)],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [messagesFree(50)] }],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
				addItems: [
					{
						feature_id: TestFeature.Messages,
						included: 50,
						reset: { interval: ResetInterval.Month },
					},
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			const actions = (row.changes?.item_changes ?? []).map((c) => c.action);
			expect(actions.sort()).toEqual(["created", "deleted"]);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: priced amount change → remove+add")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_pamt");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "PAmt",
						items: [messagesPrepaid({ amount: 5 })],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, items: [messagesPrepaid({ amount: 9 })] }],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.changes?.customize?.add_items?.[0]?.price?.amount).toBe(9);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — match key CHANGES: remove filter carries OLD interval
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: reset/billing interval change → old key on remove")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_ivl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Ivl",
						items: [
							messagesUsage({ amount: 1, interval: BillingInterval.Month }),
						],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								messagesUsage({ amount: 1, interval: BillingInterval.Year }),
							],
						},
					],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.UsageBased,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
				addItems: [
					expect.objectContaining({
						feature_id: TestFeature.Messages,
						price: expect.objectContaining({
							interval: BillingInterval.Year,
						}),
					}),
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: billing_method prepaid → usage_based")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_bm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "BM",
						items: [messagesPrepaid({ amount: 5 })],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [messagesUsage({ amount: 5 })],
						},
					],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
				addItems: [
					expect.objectContaining({
						price: expect.objectContaining({
							billing_method: BillingMethod.UsageBased,
						}),
					}),
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: free → paid / paid → free")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const freeToPaid = uniqueTestId("cv2_ci_f2p");
		const paidToFree = uniqueTestId("cv2_ci_p2f");
		await deleteDbPlans({ ctx, planIds: [freeToPaid, paidToFree] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: freeToPaid,
						name: "F2P",
						items: [messagesFree(10)],
					},
					{
						plan_id: paidToFree,
						name: "P2F",
						items: [messagesPrepaid({ amount: 5 })],
					},
				],
			});

			const f2p = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: freeToPaid,
							items: [messagesPrepaid({ amount: 5 })],
						},
					],
				}),
			);
			expectItemCustomize({
				preview: f2p,
				planId: freeToPaid,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
			});

			const p2f = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: paidToFree,
							items: [messagesFree(10)],
						},
					],
				}),
			);
			expectItemCustomize({
				preview: p2f,
				planId: paidToFree,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [freeToPaid, paidToFree] });
		}
	},
);

// RED — unlimited / pooled toggles
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: unlimited + pooled toggles → remove+add")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_flags");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Flags",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									unlimited: true,
									pooled: true,
								},
							],
						},
					],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
				addItems: [
					{
						feature_id: TestFeature.Messages,
						unlimited: true,
						pooled: true,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — rollover / proration / billing_units / max_purchase / tiers / tier_behavior
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: rollover / proration / units / tiers / tier_behavior")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_shape");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Shape",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 0,
								price: {
									amount: 1,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 1,
									max_purchase: 10,
								},
								reset: { interval: ResetInterval.Month },
								proration: {
									on_increase: OnIncrease.ProrateImmediately,
									on_decrease: OnDecrease.ProrateImmediately,
								},
							},
						],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										tiers: [
											{ to: 100, amount: 2 },
											{ to: TierInfinite, amount: 1 },
										],
										tier_behavior: TierBehavior.VolumeBased,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.Prepaid,
										billing_units: 10,
										max_purchase: 20,
									},
									reset: { interval: ResetInterval.Month },
									rollover: {
										max: 50,
										expiry_duration_type: RolloverExpiryDurationType.Month,
										expiry_duration_length: 1,
									},
									proration: {
										on_increase: OnIncrease.ProrateNextCycle,
										on_decrease: OnDecrease.ProrateImmediately,
									},
								},
							],
						},
					],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			expect(row.changes?.customize?.add_items?.[0]?.rollover).toBeDefined();
			expect(row.changes?.customize?.add_items?.[0]?.price?.tier_behavior).toBe(
				TierBehavior.VolumeBased,
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — graduated explicit ≡ default → no diff; volume flip diffs
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: tier_behavior graduated explicit → no diff; → volume diffs")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_tb");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const tiers = [
				{ to: 100, amount: 2 },
				{ to: TierInfinite, amount: 1 },
			];
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "TB",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 0,
								price: {
									tiers,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 1,
								},
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const noDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										tiers,
										tier_behavior: TierBehavior.Graduated,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.Prepaid,
										billing_units: 1,
									},
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: noDiff,
				expected: { planId, action: "none", changes: null },
			});

			const withDiff = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										tiers,
										tier_behavior: TierBehavior.VolumeBased,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.Prepaid,
										billing_units: 1,
									},
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			expect(
				findPlanPreviewRow({ preview: withDiff, planId }).changes,
			).not.toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — item FX amount change diffs; currency add/remove no item diff
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: item currency amount change vs add/remove")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_fx");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "ItemFX",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 0,
								price: {
									amount: 5,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 1,
									additional_currencies: [{ currency: "eur", amount: 4 }],
								},
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const amountChange = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										amount: 5,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.Prepaid,
										billing_units: 1,
										additional_currencies: [{ currency: "eur", amount: 6 }],
									},
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			expect(
				findPlanPreviewRow({ preview: amountChange, planId }).changes,
			).not.toBeNull();

			const currencyRemoved = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Messages,
									included: 0,
									price: {
										amount: 5,
										interval: BillingInterval.Month,
										billing_method: BillingMethod.Prepaid,
										billing_units: 1,
									},
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: currencyRemoved,
				expected: { planId, action: "none", changes: null },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — two items same feature different intervals; only edited key diffs
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: sibling intervals — only edited key diffs")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_sib");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const monthItem = messagesUsage({
				amount: 1,
				interval: BillingInterval.Month,
			});
			const yearItem = messagesUsage({
				amount: 1,
				interval: BillingInterval.Year,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Siblings",
						items: [monthItem, yearItem],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								messagesUsage({ amount: 3, interval: BillingInterval.Month }),
								yearItem,
							],
						},
					],
				}),
			);
			expectItemCustomize({
				preview,
				planId,
				removeItems: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.UsageBased,
						interval: BillingInterval.Month,
						interval_count: 1,
					},
				],
			});
			const row = findPlanPreviewRow({ preview, planId });
			const removeIntervals = (row.changes?.customize?.remove_items ?? []).map(
				(f) => f.interval,
			);
			expect(removeIntervals).not.toContain(BillingInterval.Year);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — explicit defaults → empty item_changes / no customize lanes
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-items: explicit item defaults → empty changes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ci_defs");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Defs",
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							items: [
								{
									feature_id: TestFeature.Dashboard,
									included: 0,
									pooled: false,
								},
							],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "none",
					changes: null,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
