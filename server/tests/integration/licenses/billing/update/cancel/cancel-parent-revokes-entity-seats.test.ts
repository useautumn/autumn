// TDD contract: canceling a paid license parent revokes every assigned entity seat.
// End-of-cycle revokes at expiry; immediate cancellation revokes in the same action.
import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const ENTITY_COUNT = 3;

const setupAssignedLicenseParent = async ({
	customerId,
	idPrefix,
	testClock,
}: {
	customerId: string;
	idPrefix: string;
	testClock: boolean;
}) => {
	const pro = products.base({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-dev-seat`,
		group: `${idPrefix}-dev-seat-licenses`,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock }),
			s.entities({ count: ENTITY_COUNT, featureId: TestFeature.Users }),
			s.products({ list: [pro, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: 0,
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [
					{ licenseProductId: devSeat.id, quantity: ENTITY_COUNT },
				],
			}),
			s.licenses.assign({
				licenseProductId: devSeat.id,
				entityIndexes: Array.from(
					{ length: ENTITY_COUNT },
					(_, index) => index,
				),
			}),
		],
	});

	const customer =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	for (const entity of scenario.entities) {
		const apiEntity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
		);
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: devSeat.id,
			granted: 100,
			remaining: 100,
			usage: 0,
		});
	}

	return { ...scenario, pro, devSeat };
};

const expectEntitySeatsAbsent = async ({
	autumnV2_3,
	customerId,
	entityIds,
	devSeatId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	entityIds: string[];
	devSeatId: string;
}) => {
	for (const entityId of entityIds) {
		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		await expectCustomerProducts({
			customer: entity,
			notPresent: [devSeatId],
		});
		expect(entity.balances[TestFeature.Messages]).toBeUndefined();
	}
};

test(`${chalk.yellowBright("license cancel: end of cycle expires parent and revokes entity seats")}`, async () => {
	const customerId = "license-cancel-end-of-cycle";
	const scenario = await setupAssignedLicenseParent({
		customerId,
		idPrefix: "license-cancel-eoc",
		testClock: true,
	});

	await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: scenario.pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	let customer =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		canceling: [scenario.pro.id],
	});
	for (const entity of scenario.entities) {
		const apiEntity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
		);
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: scenario.devSeat.id,
			granted: 100,
			remaining: 100,
			usage: 0,
		});
	}

	if (!scenario.testClockId) throw new Error("Test clock not enabled");
	await advanceToNextInvoice({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId,
		currentEpochMs: scenario.advancedTo,
	});

	customer = await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		notPresent: [scenario.pro.id],
	});
	await expectEntitySeatsAbsent({
		autumnV2_3: scenario.autumnV2_3,
		customerId,
		entityIds: scenario.entities.map((entity) => entity.id),
		devSeatId: scenario.devSeat.id,
	});
});

test(`${chalk.yellowBright("license cancel: immediate cancel expires parent and revokes entity seats")}`, async () => {
	const customerId = "license-cancel-immediately";
	const scenario = await setupAssignedLicenseParent({
		customerId,
		idPrefix: "license-cancel-immediate",
		testClock: false,
	});

	await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: scenario.pro.id,
		cancel_action: "cancel_immediately",
	});

	const customer =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		notPresent: [scenario.pro.id],
	});
	await expectEntitySeatsAbsent({
		autumnV2_3: scenario.autumnV2_3,
		customerId,
		entityIds: scenario.entities.map((entity) => entity.id),
		devSeatId: scenario.devSeat.id,
	});
});
