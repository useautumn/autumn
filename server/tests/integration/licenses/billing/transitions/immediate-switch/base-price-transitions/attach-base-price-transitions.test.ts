import { expect, test } from "bun:test";
import type {
	ApiEntityV2,
	AttachParamsV1Input,
	CheckResponseV3,
} from "@autumn/shared";
import { ApiVersion, BillingInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { expectAssignmentBasePrices } from "../../utils/basePriceTransitionTestUtils";

const SEAT_COUNT = 2;

test.concurrent(
	`${chalk.yellowBright("base price transition: attach replaces the same license plan")}`,
	async () => {
		const customerId = "bp-attach-same";
		const parentA = {
			...products.base({
				id: "same-pro-a",
				group: "same-pro",
				items: [items.dashboard()],
			}),
			name: "Pro A",
		};
		const parentB = {
			...products.base({
				id: "same-pro-b",
				group: "same-pro",
				items: [items.dashboard()],
			}),
			name: "Pro B",
		};
		const seat = {
			...products.base({
				id: "same-seat",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
			name: "Dev Seat",
		};
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({ list: [parentA, parentB, seat] }),
			],
			actions: [],
		});
		const rpc = new AutumnRpcCli({
			secretKey: scenario.ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		for (const [parentPlanId, amount] of [
			[parentA.id, 20],
			[parentB.id, 40],
		] as const) {
			await rpc.post("/plans.update", {
				plan_id: parentPlanId,
				licenses: [
					{
						license_plan_id: seat.id,
						included: 0,
						customize: {
							price: { amount, interval: BillingInterval.Month },
						},
					},
				],
			});
		}

		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			license_quantities: [{ license_plan_id: seat.id, quantity: SEAT_COUNT }],
			redirect_mode: "if_required",
		});
		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: scenario.entities.map((entity) => ({ entity_id: entity.id })),
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			license_quantities: [{ license_plan_id: seat.id, quantity: SEAT_COUNT }],
			redirect_mode: "if_required",
		};
		const preview =
			await scenario.autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				params,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: 40,
			newRecurringTotal: 80,
		});
		await scenario.autumnV2_3.billing.attach(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: seat.id,
			amount: 40,
			count: SEAT_COUNT,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("base price transition: attach changes multiple licenses and items")}`,
	async () => {
		const customerId = "bp-attach-mixed";
		const parentA = {
			...products.base({
				id: "mix-pro-a",
				group: "mix-pro",
				items: [items.dashboard()],
			}),
			name: "Pro A",
		};
		const parentB = {
			...products.base({
				id: "mix-pro-b",
				group: "mix-pro",
				items: [items.dashboard()],
			}),
			name: "Pro B",
		};
		const devA = {
			...products.base({
				id: "mix-dev-a",
				group: "mix-dev",
				items: [
					constructPriceItem({
						price: 10,
						interval: BillingInterval.Month,
					}),
					items.monthlyMessages({ includedUsage: 100 }),
				],
			}),
			name: "Dev A",
		};
		const devB = {
			...products.base({
				id: "mix-dev-b",
				group: "mix-dev",
				items: [
					constructPriceItem({
						price: 20,
						interval: BillingInterval.Month,
					}),
					items.monthlyMessages({ includedUsage: 500 }),
					items.dashboard(),
				],
			}),
			name: "Dev B",
		};
		const viewerA = {
			...products.base({
				id: "mix-view-a",
				group: "mix-view",
				items: [
					constructPriceItem({
						price: 5,
						interval: BillingInterval.Month,
					}),
					items.monthlyWords({ includedUsage: 50 }),
				],
			}),
			name: "View A",
		};
		const viewerB = {
			...products.base({
				id: "mix-view-b",
				group: "mix-view",
				items: [
					constructPriceItem({
						price: 8,
						interval: BillingInterval.Month,
					}),
					items.monthlyWords({ includedUsage: 80 }),
				],
			}),
			name: "View B",
		};
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [parentA, parentB, devA, devB, viewerA, viewerB],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: devA.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: viewerA.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: devB.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: viewerB.id,
					included: 0,
				}),
			],
		});
		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			license_quantities: [
				{ license_plan_id: devA.id, quantity: 2 },
				{ license_plan_id: viewerA.id, quantity: 1 },
			],
			redirect_mode: "if_required",
		});
		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devA.id,
			entities: scenario.entities.map((entity) => ({ entity_id: entity.id })),
		});
		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: viewerA.id,
			entities: [{ entity_id: scenario.entities[0].id }],
		});
		await scenario.autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: scenario.entities[0].id,
				feature_id: TestFeature.Messages,
				value: 25,
			},
			{ timeout: 2000 },
		);

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			license_quantities: [
				{ license_plan_id: devB.id, quantity: 2 },
				{ license_plan_id: viewerB.id, quantity: 1 },
			],
			redirect_mode: "if_required",
		};
		const preview =
			await scenario.autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
				params,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: 25,
			newRecurringTotal: 48,
		});
		await scenario.autumnV2_3.billing.attach(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: devB.id,
			amount: 20,
			count: 2,
		});
		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: viewerB.id,
			amount: 8,
			count: 1,
		});
		expect(
			await listLicenseAssignments({
				autumn: scenario.autumnV2_3,
				customerId,
				licensePlanId: devA.id,
				active: true,
			}),
		).toHaveLength(0);
		const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			scenario.entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			planId: devB.id,
			granted: 500,
			usage: 25,
			remaining: 475,
		});
		const dashboard = await scenario.autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: scenario.entities[0].id,
			feature_id: TestFeature.Dashboard,
			skip_cache: true,
		});
		expect(dashboard.allowed).toBe(true);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});
	},
);
