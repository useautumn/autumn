import { EntityExpand } from "@autumn/shared";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { getApiEntity } from "../getApiEntity.js";
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

			const { entities, invoices, customer: fullCus, fullEntities } = await getEntityResponse({
				ctx: req,
				entityIds: [entityId],
				customerId,
				expand,
				entityId,
			});

			const { entity: entityObj } = entities[0];
			const entityRecord = fullEntities?.find((e) => e.id === entityId);

			if (!entityRecord) {
				throw new Error(`Entity ${entityId} not found`);
			}

			const apiEntity = await getApiEntity({
				ctx: req,
				entity: entityRecord,
				fullCus,
				expand,
			});

			const withInvoices = expand.includes(EntityExpand.Invoices);

			res.status(200).json({
				...apiEntity,
				invoices: withInvoices
					? invoicesToResponse({
							invoices: invoices || [],
							logger,
						})
					: undefined,
			});
		},
	});
