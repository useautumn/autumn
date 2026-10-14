export type OracleSpendLimit = {
	feature_id?: string;
	enabled?: boolean;
	limit_type?: "absolute" | "usage_percentage";
	overage_limit?: number;
	skip_overage_billing?: boolean;
	source?: "customer" | "plan";
};

export type OracleUsageAlert = {
	feature_id?: string;
	enabled?: boolean;
	threshold?: number;
	threshold_type?:
		| "usage"
		| "usage_percentage"
		| "remaining"
		| "remaining_percentage";
	source?: "customer" | "plan";
};

export type OracleAutoTopup = {
	feature_id?: string;
	enabled?: boolean;
	threshold?: number;
	quantity?: number;
	source?: "customer" | "plan";
};

export type OracleUsageLimit = {
	feature_id?: string;
	enabled?: boolean;
	limit?: number;
	interval?: "day" | "week" | "month" | "year";
	source?: "customer" | "plan";
};

export type OracleBillingControls = {
	spend_limits?: OracleSpendLimit[];
	usage_limits?: OracleUsageLimit[];
	usage_alerts?: OracleUsageAlert[];
	auto_topups?: OracleAutoTopup[];
	overage_allowed?: { feature_id?: string; enabled?: boolean }[];
};

export type OracleCustomer = {
	found: boolean;
	id?: string;
	email?: string | null;
	name?: string | null;
	balances: Record<
		string,
		{ granted?: number; remaining?: number; usage?: number }
	>;
	planIds: string[];
	billing_controls?: OracleBillingControls;
	raw?: unknown;
};

export type OracleLicenseAssignment = {
	entity_id?: string;
	license_plan_id?: string;
	ended_at?: number | null;
};

export const readOracleLicenseAssignments = async ({
	backendUrl,
	secretKey,
	customerId,
}: {
	backendUrl: string;
	secretKey: string;
	customerId: string;
}): Promise<OracleLicenseAssignment[]> => {
	const res = await fetch(`${backendUrl}/v1/licenses.list_assignments`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${secretKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ customer_id: customerId, active: true }),
	});
	if (!res.ok) return [];
	const body = (await res.json()) as { list?: OracleLicenseAssignment[] };
	return body.list ?? [];
};

export const readOracleCustomer = async ({
	backendUrl,
	secretKey,
	customerId,
}: {
	backendUrl: string;
	secretKey: string;
	customerId: string;
}): Promise<OracleCustomer> => {
	const res = await fetch(`${backendUrl}/v1/customers/${customerId}`, {
		headers: { authorization: `Bearer ${secretKey}` },
	});
	if (!res.ok) return { found: false, balances: {}, planIds: [] };
	const body = (await res.json()) as {
		id?: string;
		email?: string | null;
		name?: string | null;
		balances?: Record<
			string,
			{ granted?: number; remaining?: number; usage?: number }
		>;
		subscriptions?: { plan_id?: string }[];
		products?: { id?: string }[];
		billing_controls?: OracleBillingControls;
	};
	const planIds = [
		...(body.subscriptions ?? []).map((sub) => sub.plan_id),
		...(body.products ?? []).map((product) => product.id),
	].filter((id): id is string => typeof id === "string");
	return {
		found: true,
		id: body.id,
		email: body.email,
		name: body.name,
		balances: body.balances ?? {},
		planIds,
		billing_controls: body.billing_controls,
		raw: body,
	};
};

export type OracleCatalogPlan = {
	id: string;
	version?: number;
	version_slug?: string | null;
	active?: boolean;
	internal_id?: string | null;
	price?: { amount?: number; interval?: string } | null;
	items: { feature_id?: string; included?: number }[];
};

export type OracleCatalog = { plans: OracleCatalogPlan[] };

export const readOracleCatalog = async ({
	backendUrl,
	secretKey,
}: {
	backendUrl: string;
	secretKey: string;
}): Promise<OracleCatalog> => {
	const res = await fetch(`${backendUrl}/v1/catalogV2.get`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${secretKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ include_versions: true }),
	});
	if (!res.ok) return { plans: [] };
	const body = (await res.json()) as { plans?: OracleCatalogPlan[] };
	return {
		plans: (body.plans ?? []).map((plan) => ({
			id: plan.id,
			version: plan.version,
			version_slug: plan.version_slug,
			active: plan.active,
			internal_id: plan.internal_id,
			price: plan.price,
			items: (plan.items ?? []).map((item) => ({
				feature_id: item.feature_id,
				included: item.included,
			})),
		})),
	};
};
