// Cross-group plan switch: when attach removes the old plan via remove_plan_ids,
// the shared seat pool and its assignments follow onto the new plan, exactly
// as a same-group switch does.
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

const SEAT_QUANTITY = 3;

test.concurrent(
	`${chalk.yellowBright("license cross-group switch: remove_plan_ids carries seat assignments onto the new plan")}`,
	async () => {
		const customerId = "license-cross-group-switch";
		const proPlan = products.base({
			id: "lic-cross-group-pro",
			group: "lic-cross-group-plg",
			items: [items.monthlyPrice({ price: 20 }), items.dashboard()],
		});
		const enterprisePlan = products.base({
			id: "lic-cross-group-enterprise",
			group: "lic-cross-group-enterprise",
			items: [items.monthlyPrice({ price: 100 }), items.dashboard()],
		});
		const seat = products.base({
			id: "lic-cross-group-seat",
			group: "lic-cross-group-seat",
			items: [
				constructPriceItem({ price: 10, interval: BillingInterval.Month }),
				items.monthlyMessages({ includedUsage: 100 }),
			],
		});

		const { ctx, entities, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [proPlan, enterprisePlan, seat] }),
			],
			actions: [],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		for (const parentPlanId of [proPlan.id, enterprisePlan.id]) {
			await rpc.post("/plans.update", {
				plan_id: parentPlanId,
				licenses: [{ license_plan_id: seat.id, included: 0 }],
			});
		}

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proPlan.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: seat.id, quantity: SEAT_QUANTITY },
			],
		});
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: entities.map((entity) => ({ entity_id: entity.id })),
		});
		const proAssignments = await listLicenseAssignments({
			autumn: autumnV2_3,
			customerId,
			licensePlanId: seat.id,
			active: true,
		});
		expect(proAssignments).toHaveLength(entities.length);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: enterprisePlan.id,
			redirect_mode: "if_required",
			remove_plan_ids: [proPlan.id],
			license_quantities: [
				{ license_plan_id: seat.id, quantity: SEAT_QUANTITY },
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [enterprisePlan.id],
			notPresent: [proPlan.id],
		});
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: enterprisePlan.id,
					paid_quantity: SEAT_QUANTITY,
					granted: SEAT_QUANTITY,
					usage: entities.length,
					remaining: SEAT_QUANTITY - entities.length,
				},
			],
		});
		const enterpriseAssignments = await listLicenseAssignments({
			autumn: autumnV2_3,
			customerId,
			licensePlanId: seat.id,
			active: true,
		});
		expect(enterpriseAssignments).toHaveLength(entities.length);
		expect(enterpriseAssignments).toEqual(
			expect.arrayContaining(
				entities.map((entity) =>
					expect.objectContaining({
						entity_id: entity.id,
						license_plan_id: seat.id,
						ended_at: null,
					}),
				),
			),
		);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
