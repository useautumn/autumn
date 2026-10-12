import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { fullCustomerWithDerivedIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/fullCustomerWithDerivedIsCustom.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";
import type { MigrationRuntime } from "../../../types/migrationDefinition.js";

/** A run's catalog versions don't change mid-run, so the run shares one cache. */
const baseProductsByMigration = new WeakMap<
	MigrationRuntime,
	BaseProductCache
>();

const baseProductsForMigration = ({
	migration,
}: {
	migration: MigrationRuntime;
}): BaseProductCache => {
	const cached = baseProductsByMigration.get(migration);
	if (cached) return cached;
	const baseProducts: BaseProductCache = new Map();
	baseProductsByMigration.set(migration, baseProducts);
	return baseProducts;
};

// The custom guard is already injected by now, so this checks the version alone.
const bumpsVersion = ({ migration }: { migration: MigrationRuntime }) =>
	Boolean(
		migration.operations?.customer?.some(
			(op) => op.type === "update_plan" && op.version !== undefined,
		),
	);

/** Loads customer state and creates the lazy Stripe cache for migration ops. */
export const setupMigrateCustomerContext = async ({
	ctx,
	migration,
	customerId,
	preview,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	customerId: string;
	preview: boolean;
}): Promise<MigrateCustomerContext> => {
	const storedFullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});
	const { fullCustomer: derivedFullCustomer, corrections } =
		await fullCustomerWithDerivedIsCustom({
			ctx,
			fullCustomer: storedFullCustomer,
			baseProducts: baseProductsForMigration({ migration }),
		});
	// A version bump spares every derived-custom plan. Without one, drift onto a row stored as
	// not custom is likely the catalog edit this migration applies; the billing-plan hook re-derives after.
	const fullCustomer = bumpsVersion({ migration })
		? derivedFullCustomer
		: {
				...derivedFullCustomer,
				customer_products: derivedFullCustomer.customer_products.map(
					(customerProduct, index) =>
						storedFullCustomer.customer_products[index].is_custom
							? customerProduct
							: { ...customerProduct, is_custom: false },
				),
			};

	return {
		migration,
		fullCustomer,
		preview,
		isCustomCorrections: corrections,
		stripeCache: createMigrationStripeCache({
			ctx,
			fullCustomer,
			allowStripeCustomerCreation: migration.no_billing_changes !== true,
		}),
	};
};
