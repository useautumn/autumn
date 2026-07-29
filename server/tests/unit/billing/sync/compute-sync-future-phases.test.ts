import { expect, test } from "bun:test";
import type {
	FullCustomer,
	FullPlanLicense,
	FullProduct,
	SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSyncFuturePhases } from "@/internal/billing/v2/actions/sync/compute/computeSyncFuturePhases";

const product = ({ id }: { id: string }): FullProduct =>
	({
		id,
		internal_id: `${id}_internal`,
		version: 1,
		group: "main",
		is_add_on: false,
		prices: [],
		entitlements: [],
		licenses: [],
	}) as unknown as FullProduct;

test("future sync phases preserve customer license quantities", () => {
	const customerId = "workspace_123";
	const seat = product({ id: "team_seat" });
	const team = product({ id: "team" });
	team.licenses = [
		{
			id: "plan_license_team_seat",
			parent_internal_product_id: team.internal_id,
			license_internal_product_id: seat.internal_id,
			included: 0,
			prepaid_only: true,
			is_custom: false,
			customized: false,
			product: seat,
		} as unknown as FullPlanLicense,
	];

	const fullCustomer = {
		id: customerId,
		internal_id: "customer_internal_123",
		customer_products: [],
		entities: [],
		extra_customer_entitlements: [],
	} as unknown as FullCustomer;
	const syncContext = {
		customer_id: customerId,
		fullCustomer,
		stripeSubscription: null,
		stripeSchedule: null,
		currency: "usd",
		immediatePhase: null,
		futurePhases: [
			{
				startsAt: Date.now() + 86_400_000,
				endsAt: null,
				productContexts: [
					{
						plan: {
							plan_id: team.id,
							license_quantities: [{ license_plan_id: seat.id, quantity: 7 }],
						},
						fullProduct: team,
						customPrices: [],
						customEntitlements: [],
						featureQuantities: [],
						customerLicenseQuantities: [
							{ licensePlanId: seat.id, totalQuantity: 7 },
						],
					},
				],
			},
		],
		currentEpochMs: Date.now(),
		acknowledgedWarnings: [],
		carryOverUsage: true,
	} satisfies SyncBillingContext;
	const ctx = {
		features: [],
		logger: { debug: () => undefined },
	} as unknown as AutumnContext;

	const result = computeSyncFuturePhases({ ctx, syncContext });

	expect(result.insertCustomerProducts).toHaveLength(1);
	expect(result.insertCustomerProducts[0]?.customer_licenses).toMatchObject([
		{
			license_internal_product_id: seat.internal_id,
			granted: 7,
			remaining: 7,
			paid_quantity: 7,
		},
	]);
});
