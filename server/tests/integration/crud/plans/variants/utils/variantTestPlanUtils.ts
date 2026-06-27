import type { ApiPlanV1 } from "@autumn/shared";
import type { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

type VariantRpc = Pick<AutumnRpcCli, "plans" | "post">;
type CustomerDeleteClient = {
	customers: {
		delete: (customerId: string) => Promise<unknown>;
	};
};

export const deleteVariantTestCustomers = async ({
	client,
	customerIds,
}: {
	client: CustomerDeleteClient;
	customerIds: string[];
}) => {
	for (const customerId of customerIds) {
		try {
			await client.customers.delete(customerId);
		} catch {}
	}
};

export const deleteVariantTestPlans = async ({
	rpc,
	planIds,
}: {
	rpc: Pick<AutumnRpcCli, "plans">;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		try {
			await rpc.plans.delete(planId, { allVersions: true });
		} catch {}
	}
};

export const createVariantPlan = async <T = ApiPlanV1>({
	rpc,
	basePlanId,
	variantPlanId,
	name,
	resetVariant = true,
}: {
	rpc: VariantRpc;
	basePlanId: string;
	variantPlanId: string;
	name: string;
	resetVariant?: boolean;
}) => {
	if (resetVariant && variantPlanId !== basePlanId) {
		await deleteVariantTestPlans({ rpc, planIds: [variantPlanId] });
	}

	return rpc.post("/plans.create_variant", {
		base_plan_id: basePlanId,
		variant_plan_id: variantPlanId,
		name,
	}) as Promise<T>;
};
