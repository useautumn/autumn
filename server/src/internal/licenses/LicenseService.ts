import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FullCusProduct, LicenseCustomize } from "@autumn/shared";
import { assignLicense } from "./actions/assignLicense.js";
import { ensurePoolsForCustomerProducts } from "./actions/ensureLicensePools.js";
import { listLicenseAssignments } from "./actions/listLicenseAssignments.js";
import { listLicensePools } from "./actions/listLicensePools.js";
import {
	listPlanLicenses,
	setPlanLicense,
} from "./actions/planLicenseActions.js";
import { unassignLicense } from "./actions/unassignLicense.js";
import { updateLicenseProduct } from "./actions/updateLicenseProduct.js";

export class LicenseService {
	static async setPlanLicense({
		ctx,
		parentPlanId,
		licensePlanId,
		includedQuantity,
		allowExtraQuantity,
		customize,
		metadata,
	}: {
		ctx: AutumnContext;
		parentPlanId: string;
		licensePlanId: string;
		includedQuantity: number;
		allowExtraQuantity: boolean;
		customize?: LicenseCustomize | null;
		metadata?: Record<string, unknown>;
	}) {
		return setPlanLicense({
			ctx,
			parentPlanId,
			licensePlanId,
			includedQuantity,
			allowExtraQuantity,
			customize,
			metadata,
		});
	}

	static async listPlanLicenses({
		ctx,
		parentPlanId,
	}: {
		ctx: AutumnContext;
		parentPlanId: string;
	}) {
		return listPlanLicenses({ ctx, parentPlanId });
	}

	static async ensurePoolsForCustomerProducts({
		ctx,
		customerProducts: newCustomerProducts,
	}: {
		ctx: AutumnContext;
		customerProducts: FullCusProduct[];
	}) {
		return ensurePoolsForCustomerProducts({
			ctx,
			customerProducts: newCustomerProducts,
		});
	}

	static async assign({
		ctx,
		customerId,
		entityId,
		planId,
		version,
		parentSubscriptionId,
		metadata,
	}: {
		ctx: AutumnContext;
		customerId: string;
		entityId: string;
		planId: string;
		version?: number;
		parentSubscriptionId?: string;
		metadata?: Record<string, unknown>;
	}) {
		return assignLicense({
			ctx,
			customerId,
			entityId,
			planId,
			version,
			parentSubscriptionId,
			metadata,
		});
	}

	static async unassign({
		ctx,
		assignmentId,
		customerId,
		entityId,
		planId,
	}: {
		ctx: AutumnContext;
		assignmentId?: string;
		customerId?: string;
		entityId?: string;
		planId?: string;
	}) {
		return unassignLicense({ ctx, assignmentId, customerId, entityId, planId });
	}

	static async listAssignments({
		ctx,
		customerId,
		entityId,
		planId,
		active = true,
	}: {
		ctx: AutumnContext;
		customerId: string;
		entityId?: string;
		planId?: string;
		active?: boolean;
	}) {
		return listLicenseAssignments({
			ctx,
			customerId,
			entityId,
			planId,
			active,
		});
	}

	static async listPools({
		ctx,
		customerId,
		entityId,
	}: {
		ctx: AutumnContext;
		customerId: string;
		entityId?: string;
	}) {
		return listLicensePools({ ctx, customerId, entityId });
	}

	static async update({
		ctx,
		licensePlanId,
		version,
		updates,
	}: {
		ctx: AutumnContext;
		licensePlanId: string;
		version?: number;
		updates: Parameters<typeof updateLicenseProduct>[0]["updates"];
	}) {
		return updateLicenseProduct({ ctx, licensePlanId, version, updates });
	}
}
