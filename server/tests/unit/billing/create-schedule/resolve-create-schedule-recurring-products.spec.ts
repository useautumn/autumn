import { describe, expect, test } from "bun:test";
import type {
	CreateScheduleBillingContext,
	Entity,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { resolveCreateScheduleRecurringProducts } from "@/internal/billing/v2/actions/createSchedule/utils/resolveCreateScheduleRecurringProducts";

const entity = (internalId: string) =>
	({ internal_id: internalId, id: internalId }) as unknown as Entity;

const productInGroup = ({
	id,
	group,
	isAddOn = false,
}: {
	id: string;
	group: string;
	isAddOn?: boolean;
}): FullProduct => ({ ...products.createFull({ id, isAddOn }), group });

type PlanInput = { fullProduct: FullProduct; entity?: Entity };

const buildBillingContext = ({
	existingCustomerProducts = [],
	openingPlans,
	laterPhases = [],
	replacedScheduleCustomerProductIds = [],
}: {
	existingCustomerProducts?: FullCusProduct[];
	openingPlans: PlanInput[];
	laterPhases?: { startsAt: number; plans: PlanInput[] }[];
	replacedScheduleCustomerProductIds?: string[];
}): CreateScheduleBillingContext =>
	({
		fullCustomer: { customer_products: existingCustomerProducts },
		productContexts: openingPlans.map(
			({ fullProduct, entity: planEntity }) => ({
				fullProduct,
				fullCustomer: {
					entity: planEntity,
					customer_products: existingCustomerProducts,
				},
			}),
		),
		scheduledPhaseContexts: laterPhases.map(({ startsAt, plans }) => ({
			startsAt,
			endsAt: undefined,
			productContexts: plans.map(({ fullProduct, entity: planEntity }) => ({
				fullProduct,
				entity: planEntity,
			})),
		})),
		replacedScheduleCustomerProductIds,
	}) as unknown as CreateScheduleBillingContext;

describe(chalk.yellowBright("resolveCreateScheduleRecurringProducts"), () => {
	test("expires a product whose group the immediate phase claims", () => {
		const existing = customerProducts.create({
			id: "cus_prod_pro",
			product: productInGroup({ id: "pro", group: "main" }),
		});

		const { recurringOutgoing, recurringEndingAtPhase } =
			resolveCreateScheduleRecurringProducts({
				billingContext: buildBillingContext({
					existingCustomerProducts: [existing],
					openingPlans: [
						{
							fullProduct: productInGroup({ id: "enterprise", group: "main" }),
						},
					],
				}),
			});

		expect(recurringOutgoing.map((p) => p.id)).toEqual(["cus_prod_pro"]);
		expect(recurringEndingAtPhase).toEqual([]);
	});

	test("expires a product the replaced schedule placed even when no phase claims it", () => {
		const existing = customerProducts.create({
			id: "cus_prod_old",
			product: productInGroup({ id: "legacy", group: "other" }),
		});

		const { recurringOutgoing } = resolveCreateScheduleRecurringProducts({
			billingContext: buildBillingContext({
				existingCustomerProducts: [existing],
				openingPlans: [
					{ fullProduct: productInGroup({ id: "pro", group: "main" }) },
				],
				replacedScheduleCustomerProductIds: ["cus_prod_old"],
			}),
		});

		expect(recurringOutgoing.map((p) => p.id)).toEqual(["cus_prod_old"]);
	});

	test("ends a survivor when the earliest later phase claims its group", () => {
		const existing = customerProducts.create({
			id: "cus_prod_pro",
			product: productInGroup({ id: "pro", group: "main" }),
		});

		const { recurringOutgoing, recurringEndingAtPhase } =
			resolveCreateScheduleRecurringProducts({
				billingContext: buildBillingContext({
					existingCustomerProducts: [existing],
					openingPlans: [
						{
							fullProduct: productInGroup({
								id: "credits",
								group: "",
								isAddOn: true,
							}),
						},
					],
					laterPhases: [
						{
							startsAt: 2_000,
							plans: [
								{
									fullProduct: productInGroup({
										id: "enterprise",
										group: "main",
									}),
								},
							],
						},
						{
							startsAt: 3_000,
							plans: [
								{ fullProduct: productInGroup({ id: "ultra", group: "main" }) },
							],
						},
					],
				}),
			});

		expect(recurringOutgoing).toEqual([]);
		expect(recurringEndingAtPhase).toEqual([
			{ customerProduct: existing, endsAt: 2_000 },
		]);
	});

	test("leaves a product alone when no phase claims its group", () => {
		const existing = customerProducts.create({
			id: "cus_prod_pro",
			product: productInGroup({ id: "pro", group: "main" }),
		});

		const { recurringOutgoing, recurringEndingAtPhase } =
			resolveCreateScheduleRecurringProducts({
				billingContext: buildBillingContext({
					existingCustomerProducts: [existing],
					openingPlans: [
						{
							fullProduct: productInGroup({
								id: "credits",
								group: "",
								isAddOn: true,
							}),
						},
					],
					laterPhases: [
						{
							startsAt: 2_000,
							plans: [
								{
									fullProduct: productInGroup({ id: "extra", group: "other" }),
								},
							],
						},
					],
				}),
			});

		expect(recurringOutgoing).toEqual([]);
		expect(recurringEndingAtPhase).toEqual([]);
	});

	test("an add-on is only claimed by its own product id, never by its group", () => {
		const existingAddOn = customerProducts.create({
			id: "cus_prod_credits",
			product: productInGroup({ id: "credits", group: "main", isAddOn: true }),
		});

		const claimedByGroup = resolveCreateScheduleRecurringProducts({
			billingContext: buildBillingContext({
				existingCustomerProducts: [existingAddOn],
				openingPlans: [
					{ fullProduct: productInGroup({ id: "enterprise", group: "main" }) },
				],
			}),
		});
		expect(claimedByGroup.recurringOutgoing).toEqual([]);

		const claimedById = resolveCreateScheduleRecurringProducts({
			billingContext: buildBillingContext({
				existingCustomerProducts: [existingAddOn],
				openingPlans: [
					{
						fullProduct: productInGroup({
							id: "credits",
							group: "main",
							isAddOn: true,
						}),
					},
				],
			}),
		});
		expect(claimedById.recurringOutgoing.map((p) => p.id)).toEqual([
			"cus_prod_credits",
		]);
	});

	test("an entity-scoped product is untouched by customer-level phases", () => {
		const existingOnEntity = customerProducts.create({
			id: "cus_prod_seats",
			product: productInGroup({ id: "seats", group: "main" }),
			internalEntityId: "ent_a",
		});

		const { recurringOutgoing, recurringEndingAtPhase } =
			resolveCreateScheduleRecurringProducts({
				billingContext: buildBillingContext({
					existingCustomerProducts: [existingOnEntity],
					openingPlans: [
						{
							fullProduct: productInGroup({ id: "pro", group: "main" }),
							entity: entity("ent_a"),
						},
					],
					laterPhases: [
						{
							startsAt: 2_000,
							plans: [
								{
									fullProduct: productInGroup({
										id: "enterprise",
										group: "main",
									}),
								},
							],
						},
					],
				}),
			});

		// Claimed now by the entity-scoped opening plan, not by the later
		// customer-level phase.
		expect(recurringOutgoing.map((p) => p.id)).toEqual(["cus_prod_seats"]);
		expect(recurringEndingAtPhase).toEqual([]);
	});

	test("a one-off plan claims only its own product id, never its group", () => {
		const existing = customerProducts.create({
			id: "cus_prod_pro",
			product: productInGroup({ id: "pro", group: "main" }),
		});
		const oneOffProduct: FullProduct = {
			...productInGroup({ id: "setup_fee", group: "main" }),
			prices: [prices.createOneOff({ id: "price_setup_fee" })],
		};

		const { recurringOutgoing } = resolveCreateScheduleRecurringProducts({
			billingContext: buildBillingContext({
				existingCustomerProducts: [existing],
				openingPlans: [{ fullProduct: oneOffProduct }],
			}),
		});

		expect(recurringOutgoing).toEqual([]);
	});

	test("splits scheduled-status products into recurringScheduled", () => {
		const scheduled = customerProducts.create({
			id: "cus_prod_scheduled",
			product: productInGroup({ id: "pro", group: "main" }),
			status: CusProductStatus.Scheduled,
		});

		const { recurringActive, recurringScheduled } =
			resolveCreateScheduleRecurringProducts({
				billingContext: buildBillingContext({
					existingCustomerProducts: [scheduled],
					openingPlans: [
						{
							fullProduct: productInGroup({ id: "enterprise", group: "main" }),
						},
					],
				}),
			});

		expect(recurringActive).toEqual([]);
		expect(recurringScheduled.map((p) => p.id)).toEqual(["cus_prod_scheduled"]);
	});
});
