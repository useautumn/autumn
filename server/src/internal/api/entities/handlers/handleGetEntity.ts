import { ApiEntitySchema, EntityExpand } from "@autumn/shared";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { parseEntityExpand } from "../entityUtils.js";
import { getEntityResponse } from "../getEntityUtils.js";

export const handleGetEntity = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "getEntity",
		handler: async (req, res) => {
			const entityId = req.params.entity_id as string;
			const customerId = req.params.customer_id as string;
			const expand = parseEntityExpand(req.query.expand);

			const { logger } = req;

			const { entities, invoices } = await getEntityResponse({
				ctx: req,
				entityIds: [entityId],
				customerId,
				expand,
				entityId,
			});

			const entity = entities[0];
			const withInvoices = expand.includes(EntityExpand.Invoices);

			res.status(200).json(
				ApiEntitySchema.parse({
					...entity,
					invoices: withInvoices
						? invoicesToResponse({
								invoices: invoices || [],
								logger,
							})
						: undefined,
				}),
			);
		},
	});
