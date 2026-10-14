import {
	isBillablePlanV2,
	mapToProductV2,
	type OnboardingStatus,
	Scopes,
} from "@autumn/shared";
import { isTinybirdConfigured } from "@/external/tinybird/tinybirdUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const USAGE_TIMEOUT_MS = 500;

const hasBillablePlan = async ({ ctx }: { ctx: AutumnContext }) => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return products.some((product) =>
		isBillablePlanV2({ items: mapToProductV2({ product }).items }),
	);
};

const hasCustomer = async ({ ctx }: { ctx: AutumnContext }) => {
	const { total_count } = await CusService.countByOrgIdAndEnv({ ctx });
	return total_count > 0;
};

const hasTrackedUsage = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<boolean | null> => {
	if (!isTinybirdConfigured()) return null;

	const timeout = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), USAGE_TIMEOUT_MS),
	);
	const query = eventActions
		.getTopEventNames({ ctx, limit: 1 })
		.then(({ eventNames }) => eventNames.length > 0)
		.catch(() => null);

	return Promise.race([query, timeout]);
};

export const handleGetOnboardingStatus = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");

		const [catalog, customer, usage] = await Promise.all([
			hasBillablePlan({ ctx }),
			hasCustomer({ ctx }),
			hasTrackedUsage({ ctx }),
		]);

		return c.json({
			catalog,
			customer,
			usage,
			deployed: ctx.org.deployed ?? false,
		} satisfies OnboardingStatus);
	},
});
