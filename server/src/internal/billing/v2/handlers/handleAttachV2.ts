import {
	AffectedResource,
	ApiVersion,
	AttachBodyV0Schema,
	AttachBodyV1Schema,
} from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { computeAttachPlan } from "../compute/computeAttachPlan";
import { executeAttachActions } from "../execute/executeAttachActions";
import { fetchAttachContext } from "../fetch/fetchAttachContext";

export const handleAttachV2 = createRoute({
	versionedBody: {
		latest: AttachBodyV1Schema,
		[ApiVersion.V2_0]: AttachBodyV0Schema,
	},
	resource: AffectedResource.Attach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		// Step 1: Fetch autumn state
		const attachContext = await fetchAttachContext({
			ctx,
			body,
		});

		// Step 2: Compute attach plan (no external calls)
		const attachPlan = await computeAttachPlan({
			ctx,
			attachContext,
		});

		// Step 3: Execute attach actions
		const attachResponse = await executeAttachActions({
			ctx,
			attachContext,
			attachPlan,
		});

		ctx.logger.info(`attach completed!`);
		return c.json({ success: true, attachResponse }, 200);
	},
});

// Phase 1: FETCH (all external state upfront)
// ├── Stripe: customer, subscription, schedule, payment method
// └── Autumn DB: customer, products, existing cus products

// Phase 2: COMPUTE (pure Autumn logic, zero external calls)
// ├── Resolve actions
// ├── Init new cus products (using sub anchor from Phase 1)
// ├── Build line items
// └── Determine Stripe operations needed

// Phase 3: EXECUTE STRIPE (all Stripe writes together)
// ├── Create/pay invoice
// ├── Update/create subscription
// └── Update/create schedule

// Phase 4: EXECUTE AUTUMN (all DB writes together)
// ├── Insert new cus products
// ├── Update ongoing cus product status
// └── Delete scheduled cus product if needed
