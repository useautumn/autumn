import {
	AffectedResource,
	ApiVersion,
	addToExpand,
	backwardsChangeActive,
	CreateCustomerParamsV0Schema,
	CreateCustomerQuerySchema,
	CustomerDataSchema,
	CustomerExpand,
	Scopes,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rejectRuleAdmittedRequest } from "@/internal/approvals/enforce/access/rejectRuleAdmittedRequest.js";
import { scopesWereGrantedByRules } from "@/internal/approvals/enforce/access/routeApprovalAction.js";
import { getOrCreateApiCustomerByRollout } from "@/internal/customers/actions/getOrCreateApiCustomerByRollout.js";
import { CusService } from "@/internal/customers/CusService.js";
import { applySubjectLookupDbOnly } from "@/internal/misc/miscellaneousEdgeConfig/applySubjectLookupDbOnly.js";

export const handlePostCustomer = createRoute({
	scopes: [Scopes.Customers.Write],
	versionedQuery: {
		latest: CreateCustomerQuerySchema,
		[ApiVersion.V1_2]: CreateCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	body: CreateCustomerParamsV0Schema,

	handler: async (c) => {
		let ctx = c.get("ctx");

		const { expand = [], with_autumn_id } = c.req.valid("query");
		const createCusParams = c.req.valid("json");

		// SIDE EFFECT
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CustomerExpand.Invoices);
		}

		// SECOND SIDE EFFECT
		if (ctx.apiVersion.lte(ApiVersion.V1_2)) {
			ctx = addToExpand({
				ctx,
				add: [
					CustomerExpand.SubscriptionsPlan,
					CustomerExpand.PurchasesPlan,
					CustomerExpand.BalancesFeature,
				],
			});
		}

		// A creation grant doesn't cover get-or-create's update of an existing customer.
		if (
			scopesWereGrantedByRules({ ctx }) &&
			(!createCusParams.id ||
				(await CusService.get({
					db: ctx.db,
					idOrInternalId: createCusParams.id,
					orgId: ctx.org.id,
					env: ctx.env,
				})))
		) {
			rejectRuleAdmittedRequest({ ctx, action: "customers.update" });
		}

		applySubjectLookupDbOnly({ ctx });

		const start = Date.now();

		const customerData = CustomerDataSchema.parse(createCusParams);

		const apiCustomer = await getOrCreateApiCustomerByRollout({
			ctx,
			params: {
				customer_id: createCusParams.id,
				customer_data: customerData,
				entity_id: createCusParams.entity_id,
				entity_data: createCusParams.entity_data,
			},
			billingDetails: createCusParams.billing_details,
			source: "handlePostCustomer",
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[post-customer] duration: ${duration}ms`);

		return c.json(apiCustomer);
	},
});
