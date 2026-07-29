/** Basic license assignment lifecycle coverage: release, reuse, and customer-level
 * visibility. */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
	CheckResponseV3,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

const INCLUDED_SEATS = 1;
const REQUESTED_SEATS = 3;
const PAID_SEATS = REQUESTED_SEATS - INCLUDED_SEATS;
const INCLUDED_MESSAGES = 100;
const USED_MESSAGES = 35;

const expectLicensePool = async ({
	autumn,
	customerId,
	licensePlanId,
	parentPlanId,
	usage,
}: {
	autumn: AutumnInt;
	customerId: string;
	licensePlanId: string;
	parentPlanId: string;
	usage: number;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: licensePlanId,
				parent_plan_id: parentPlanId,
				granted: REQUESTED_SEATS,
				usage,
				remaining: REQUESTED_SEATS - usage,
				paid_quantity: PAID_SEATS,
			},
		],
	});
	return customer;
};

const expectEntityMessages = async ({
	autumn,
	customerId,
	entityId,
	licensePlanId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	licensePlanId: string;
}) => {
	const entity = await autumn.entities.get<ApiEntityV2>(customerId, entityId);
	expectBalanceCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		planId: licensePlanId,
		granted: INCLUDED_MESSAGES,
		remaining: INCLUDED_MESSAGES - USED_MESSAGES,
		usage: USED_MESSAGES,
	});
};

const expectCustomerViewExcludesLicenseAssignment = async ({
	ctx,
	autumn,
	customerId,
	parentPlanId,
	licensePlanId,
}: {
	ctx: AutumnContext;
	autumn: AutumnInt;
	customerId: string;
	parentPlanId: string;
	licensePlanId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [parentPlanId],
		notPresent: [licensePlanId],
	});

	const productsPage = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: { start_cursor: "", limit: 10, show_expired: false },
	});
	expect(
		productsPage.list.some(({ product }) => product.id === licensePlanId),
	).toBe(false);

	const check = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.allowed).toBe(false);
};

test.concurrent(
	`${chalk.yellowBright("license-assign: released paid seat preserves usage when reused by same and different entities")}`,
	async () => {
		const customerId = "license-assign-reuse";
		const pro = products.pro({
			id: "assign-reuse-pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "assign-reuse-dev-seat",
			group: "assign-reuse-dev-seat-licenses",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES }),
			],
		});

		const { ctx, entities, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pro, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: devSeat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: REQUESTED_SEATS },
			],
		});

		const customer = await expectLicensePool({
			autumn: autumnV2_3,
			customerId,
			licensePlanId: devSeat.id,
			parentPlanId: pro.id,
			usage: 0,
		});
		await expectCustomerProducts({ customer, active: [pro.id] });
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [{ entity_id: entities[0].id }],
		});
		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: USED_MESSAGES,
			},
			{ timeout: 2000 },
		);
		await expectEntityMessages({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			licensePlanId: devSeat.id,
		});

		let assignedEntityId = entities[0].id;
		for (const nextEntityId of [entities[0].id, entities[1].id]) {
			await autumnV2_3.licenses.release({
				customer_id: customerId,
				license_plan_id: devSeat.id,
				entity_ids: [assignedEntityId],
			});
			await expectLicensePool({
				autumn: autumnV2_3,
				customerId,
				licensePlanId: devSeat.id,
				parentPlanId: pro.id,
				usage: 0,
			});
			await expectCustomerViewExcludesLicenseAssignment({
				ctx,
				autumn: autumnV2_3,
				customerId,
				parentPlanId: pro.id,
				licensePlanId: devSeat.id,
			});

			await autumnV2_3.licenses.attach({
				customer_id: customerId,
				plan_id: devSeat.id,
				entities: [{ entity_id: nextEntityId }],
			});
			await expectEntityMessages({
				autumn: autumnV2_3,
				customerId,
				entityId: nextEntityId,
				licensePlanId: devSeat.id,
			});
			await expectLicensePool({
				autumn: autumnV2_3,
				customerId,
				licensePlanId: devSeat.id,
				parentPlanId: pro.id,
				usage: 1,
			});
			assignedEntityId = nextEntityId;
		}

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
