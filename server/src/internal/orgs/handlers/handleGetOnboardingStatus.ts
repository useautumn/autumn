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

/** Analytics is the one check that leaves the database, so it gets a deadline.
 * Past it the step reports unknown rather than holding up the other four. */
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

/** Null means "we couldn't tell" — a slow or unconfigured analytics backend
 * must not make a completed step look incomplete. */
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

/**
 * POST /organization.onboardingStatus
 *
 * One payload for the onboarding checklist. The dashboard used to derive these
 * from four independent queries, which meant progress ticked upwards on screen
 * as each one landed.
 */
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
