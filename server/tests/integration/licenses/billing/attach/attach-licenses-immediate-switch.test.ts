import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const DEV_SEAT_PRICE = 20;
const DEV_SEAT_MESSAGES = 500;
const DEV_SEAT_QUANTITY = 2;

test.skip(`${chalk.yellowBright("license attach immediate switch: assigned seats move from Pro to Premium")}`, async () => {
	const customerId = "license-attach-immediate-switch";
	const pro = products.pro({
		id: "license-switch-pro",
		items: [items.dashboard()],
	});
	const premium = products.premium({
		id: "license-switch-premium",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "license-switch-dev-seat",
		group: "license-switch-dev-seat-group",
		items: [
			items.monthlyPrice({ price: DEV_SEAT_PRICE }),
			items.monthlyMessages({ includedUsage: DEV_SEAT_MESSAGES }),
		],
	});

	const { ctx, entities, licenseAssignments, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [pro, premium, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: premium.id,
				licenseProductId: devSeat.id,
				included: 0,
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [
					{
						licenseProductId: devSeat.id,
						quantity: DEV_SEAT_QUANTITY,
					},
				],
			}),
			s.licenses.assign({
				licenseProductId: devSeat.id,
				parentProductId: pro.id,
				entityIndex: 0,
			}),
			s.licenses.assign({
				licenseProductId: devSeat.id,
				parentProductId: pro.id,
				entityIndex: 1,
			}),
		],
	});

	expect(licenseAssignments).toHaveLength(DEV_SEAT_QUANTITY);

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeat.id, quantity: DEV_SEAT_QUANTITY },
		],
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id, devSeat.id],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: premium.id,
				granted: DEV_SEAT_QUANTITY,
				usage: DEV_SEAT_QUANTITY,
				remaining: 0,
				paid_quantity: DEV_SEAT_QUANTITY,
			},
		],
	});

	const assignments = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		active: true,
	});
	expect(assignments).toHaveLength(DEV_SEAT_QUANTITY);
	expect(assignments).toEqual(
		expect.arrayContaining(
			licenseAssignments.map((assignment) =>
				expect.objectContaining({
					id: assignment.id,
					entity_id: assignment.entity_id,
					license_plan_id: devSeat.id,
					ended_at: null,
				}),
			),
		),
	);

	for (const entity of entities) {
		const apiEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
		);
		await expectCustomerProducts({
			customer: apiEntity,
			active: [devSeat.id],
		});
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: devSeat.id,
			granted: DEV_SEAT_MESSAGES,
			remaining: DEV_SEAT_MESSAGES,
			usage: 0,
		});
	}

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
