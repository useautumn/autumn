import { expect } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	ProductItem,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

export const ITEM_TRANSITION_ENTITY_COUNT = 3;
export const ITEM_TRANSITION_ENTITY_USAGES = [20, 65, 90] as const;

export const setupItemTransitionScenario = async ({
	idPrefix,
	fromItems,
	toItems,
	trackedFeatureIds = [],
	fromParentPrice,
	toParentPrice,
	testClock = false,
}: {
	idPrefix: string;
	fromItems: ProductItem[];
	toItems: ProductItem[];
	trackedFeatureIds?: string[];
	fromParentPrice?: number;
	toParentPrice?: number;
	testClock?: boolean;
}) => {
	const customerId = `${idPrefix}-customer`;
	const licenseGroup = `${idPrefix}-seat-group`;
	const fromParent = {
		...products.base({
			id: `${idPrefix}-parent-from`,
			items: [
				items.dashboard(),
				...(fromParentPrice === undefined
					? []
					: [items.monthlyPrice({ price: fromParentPrice })]),
			],
		}),
		name: "From Parent",
	};
	const toParent = {
		...products.base({
			id: `${idPrefix}-parent-to`,
			items: [
				items.dashboard(),
				...(toParentPrice === undefined
					? []
					: [items.monthlyPrice({ price: toParentPrice })]),
			],
		}),
		name: "To Parent",
	};
	const fromSeat = {
		...products.base({
			id: `${idPrefix}-seat-from`,
			group: licenseGroup,
			items: [items.monthlyPrice({ price: 10 }), ...fromItems],
		}),
		name: "From Seat",
	};
	const toSeat = {
		...products.base({
			id: `${idPrefix}-seat-to`,
			group: licenseGroup,
			items: [items.monthlyPrice({ price: 10 }), ...toItems],
		}),
		name: "To Seat",
	};

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock }),
			s.entities({
				count: ITEM_TRANSITION_ENTITY_COUNT,
				featureId: TestFeature.Users,
			}),
			s.products({ list: [fromParent, toParent, fromSeat, toSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: fromParent.id,
				licenseProductId: fromSeat.id,
				included: 0,
			}),
			s.licenses.link({
				parentProductId: toParent.id,
				licenseProductId: toSeat.id,
				included: 0,
			}),
			s.billing.attach({
				productId: fromParent.id,
				licenseQuantities: [
					{
						licenseProductId: fromSeat.id,
						quantity: ITEM_TRANSITION_ENTITY_COUNT,
					},
				],
			}),
			s.licenses.assign({
				licenseProductId: fromSeat.id,
				entityIndexes: Array.from(
					{ length: ITEM_TRANSITION_ENTITY_COUNT },
					(_, index) => index,
				),
			}),
			...trackedFeatureIds.flatMap((featureId) =>
				ITEM_TRANSITION_ENTITY_USAGES.map((value, entityIndex) =>
					s.track({ featureId, value, entityIndex, timeout: 2000 }),
				),
			),
		],
	});
	await expectStripeSubscriptionCorrect({ ctx: scenario.ctx, customerId });

	return {
		...scenario,
		customerId,
		fromParent,
		toParent,
		fromSeat,
		toSeat,
	};
};

export type ItemTransitionScenario = Awaited<
	ReturnType<typeof setupItemTransitionScenario>
>;

export const completeImmediateItemTransition = async ({
	scenario,
}: {
	scenario: ItemTransitionScenario;
}) => {
	const {
		autumnV2_3,
		ctx,
		customerId,
		fromParent,
		toParent,
		fromSeat,
		toSeat,
	} = scenario;

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: toParent.id,
		redirect_mode: "if_required",
	});

	const customer = await pollUntil({
		fetch: () => autumnV2_3.customers.get<ApiCustomerV5>(customerId),
		until: (value) =>
			value.subscriptions.some(
				(subscription) => subscription.plan_id === toParent.id,
			) &&
			!value.subscriptions.some(
				(subscription) => subscription.plan_id === fromParent.id,
			),
	});
	await expectCustomerProducts({
		customer,
		active: [toParent.id],
		notPresent: [fromParent.id, fromSeat.id, toSeat.id],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: toSeat.id,
				parent_plan_id: toParent.id,
				paid_quantity: ITEM_TRANSITION_ENTITY_COUNT,
				granted: ITEM_TRANSITION_ENTITY_COUNT,
				usage: ITEM_TRANSITION_ENTITY_COUNT,
				remaining: 0,
			},
		],
	});

	const assignmentsAfter = await pollUntil({
		fetch: () =>
			listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				licensePlanId: toSeat.id,
				active: true,
			}),
		until: (assignments) => assignments.length === ITEM_TRANSITION_ENTITY_COUNT,
	});
	expect(assignmentsAfter).toHaveLength(ITEM_TRANSITION_ENTITY_COUNT);

	await expectAssignmentsAnchoredToParent({
		ctx,
		customerId,
		parentPlanId: toParent.id,
		count: ITEM_TRANSITION_ENTITY_COUNT,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
};
