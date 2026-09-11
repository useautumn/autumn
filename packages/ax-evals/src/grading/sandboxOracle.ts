/**
 * Reads the run's throwaway org through the dev server's API — the test
 * oracle for integration cases: what did the agent's code actually do to
 * Autumn? Captured by the task before org deletion; scorers read the capture.
 */

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
	/** featureId → { granted, remaining, usage } from balances */
	balances: Record<
		string,
		{ granted?: number; remaining?: number; usage?: number }
	>;
	planIds: string[];
	/** effective billing controls from the customer read (2.3+ merges plan defaults, tagged by source) */
	billing_controls?: OracleBillingControls;
	raw?: unknown;
};

export type OracleLicenseAssignment = {
	entity_id?: string;
	license_plan_id?: string;
	ended_at?: number | null;
};

/** Active license assignments for the customer — empty on any error (the
 * expectation's metadata explains the miss). */
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
