import { describe, expect, test } from "bun:test";
import type {
	FullCustomer,
	ResolvedCreateSchedulePhaseV0,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const parent = products.createFull({
	id: "parent",
	prices: [prices.createFixed({ id: "price_parent" })],
});

await mockModuleWithRestore(
	"@/internal/billing/v2/actions/attach/setup/setupAttachProductContext",
	() => ({
		setupAttachProductContext: async () => ({
			fullProduct: parent,
			customPrices: [],
			customEnts: [],
			insertPlanLicenses: [],
		}),
	}),
);

const { setupScheduledProductsContext } = await import(
	"@/internal/billing/v2/actions/setPlans/setup/setupScheduledProductsContext"
);

const LATER = 1_800_000_000_000;

const scheduledLicenseQuantities = async (
	plan: ResolvedCreateSchedulePhaseV0["plans"][number],
) => {
	const [phase] = await setupScheduledProductsContext({
		ctx: contexts.create({}),
		phases: [{ starts_at: LATER, plans: [plan] }],
		fullCustomer: { customer_products: [] } as unknown as FullCustomer,
		currentEpochMs: LATER - 1,
		immediatePhaseProductContexts: [],
	});
	return phase?.productContexts[0]?.customerLicenseQuantities;
};

describe(chalk.yellowBright("setupScheduledProductsContext"), () => {
	test("a later phase that omits license_quantities leaves them unset", async () => {
		expect(
			await scheduledLicenseQuantities({ plan_id: parent.id }),
		).toBeUndefined();
	});

	test("a later phase that lists license_quantities keeps them", async () => {
		expect(
			await scheduledLicenseQuantities({
				plan_id: parent.id,
				license_quantities: [{ license_plan_id: "seat", quantity: 8 }],
			}),
		).toEqual([{ licensePlanId: "seat", totalQuantity: 8 }]);
	});
});
