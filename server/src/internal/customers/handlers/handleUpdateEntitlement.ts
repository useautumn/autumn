import {
	ErrCode,
	type FullCustomerEntitlement,
	getCusEntBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { adjustAllowance } from "@/trigger/adjustAllowance.js";
import { performDeductionOnCusEnt } from "@/trigger/updateBalanceTask.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { CusProductService } from "../cusProducts/CusProductService.js";

const getCusOrgAndCusPrice = async ({
	db,
	req,
	cusEnt,
}: {
	db: DrizzleCli;
	req: ExtendedRequest;
	cusEnt: FullCustomerEntitlement;
}) => {
	const [cusPrice, customer, org] = await Promise.all([
		CusPriceService.getRelatedToCusEnt({
			db,
			cusEnt,
		}),
		CusService.getByInternalId({
			db,
			internalId: cusEnt.internal_customer_id,
		}),
		OrgService.getFromReq(req),
	]);

	return { cusPrice, customer, org };
};

export const handleUpdateEntitlement = async (req: any, res: any) => {
	try {
		const { db } = req;
		const { customer_entitlement_id } = req.params;
		const { balance, next_reset_at, entity_id } = req.body;

		if (isNaN(parseFloat(balance))) {
			throw new RecaseError({
				message: "Invalid balance",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (
			next_reset_at !== null &&
			(!Number.isInteger(next_reset_at) || next_reset_at < 0)
		) {
			throw new RecaseError({
				message: "Next reset at must be a valid unix timestamp or null",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Check if org owns the entitlement
		const cusEnt = await CusEntService.getStrict({
			db,
			id: customer_entitlement_id,
			orgId: req.orgId,
			env: req.env,
			withCusProduct: true,
		});

		const cusProduct = await CusProductService.get({
			db,
			id: cusEnt.customer_product_id,
			orgId: req.orgId,
			env: req.env,
		});

		// if (balance < 0 && !cusEnt.usage_allowed) {
		// 	throw new RecaseError({
		// 		message: "Entitlement does not allow usage",
		// 		code: ErrCode.InvalidRequest,
		// 		statusCode: StatusCodes.BAD_REQUEST,
		// 	});
		// }

		if (cusEnt.unlimited) {
			throw new RecaseError({
				message: "Entitlement is unlimited",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const { balance: masterBalance } = getCusEntBalance({
			cusEnt,
			entityId: entity_id,
		});

		const deducted = new Decimal(masterBalance!).minus(balance).toNumber();

		const originalBalance = structuredClone(masterBalance);

		const { newBalance, newEntities, newAdjustment } = performDeductionOnCusEnt(
			{
				cusEnt: {
					...cusEnt,
					customer_product: cusProduct!,
				},
				toDeduct: deducted,
				addAdjustment: true,
				allowNegativeBalance: true,
				entityId: entity_id,
			},
		);

		const updates = {
			balance: newBalance,
			next_reset_at,
			entities: newEntities,
			adjustment: newAdjustment,
		};

		const { cusPrice, customer, org } = await getCusOrgAndCusPrice({
			db,
			req,
			cusEnt,
		});

		if (cusPrice && customer) {
			const fullCusProduct = await CusProductService.get({
				db,
				id: cusEnt.customer_product_id,
				orgId: req.orgId,
				env: req.env,
			});

			const { newReplaceables, deletedReplaceables } = await adjustAllowance({
				db,
				env: req.env,
				org: org,
				affectedFeature: cusEnt.entitlement.feature,
				cusEnt: {
					...cusEnt,
					customer_product: fullCusProduct!,
				},
				cusPrices: [cusPrice],
				customer: customer,
				originalBalance: originalBalance!,
				newBalance: balance,
				logger: req.logger,
			});

			if (newReplaceables && newReplaceables.length > 0) {
				updates.balance = newBalance! - newReplaceables.length;
			}

			if (deletedReplaceables && deletedReplaceables.length > 0) {
				updates.balance = newBalance! + deletedReplaceables.length;
			}
		}

		await CusEntService.update({
			db,
			id: customer_entitlement_id,
			updates,
		});

		res.status(200).json({ success: true });
	} catch (error) {
		handleRequestError({
			req,
			error,
			res,
			action: "update customer entitlement",
		});
	}
};
