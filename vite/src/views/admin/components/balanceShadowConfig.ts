export const BALANCE_SHADOW_QUERY_KEY = [
	"admin-edge-config",
	"balance-shadow",
] as const;
export const BALANCE_SHADOW_MAX_CUSTOMERS = 20;

export type BalanceShadowCustomer = {
	orgId: string;
	env: "live" | "sandbox";
	customerId: string;
	featureId: string;
};

export type BalanceShadowConfig =
	| { enabled: false }
	| {
			enabled: true;
			run: {
				runId: string;
				ownershipTopic: string;
				expiresAt: number;
				customers: BalanceShadowCustomer[];
			};
	  };

export type BalanceShadowCustomerRow = BalanceShadowCustomer & {
	rowId: string;
};

export type BalanceShadowFormValues = {
	enabled: boolean;
	runId: string;
	ownershipTopic: string;
	expiresAt: string;
	customers: BalanceShadowCustomerRow[];
};

export const createBalanceShadowCustomerRow = (): BalanceShadowCustomerRow => ({
	rowId: crypto.randomUUID(),
	orgId: "",
	env: "sandbox",
	customerId: "",
	featureId: "",
});

export const getBalanceShadowFormValues = ({
	config,
	now = Date.now(),
}: {
	config: BalanceShadowConfig;
	now?: number;
}): BalanceShadowFormValues => {
	const run = config.enabled ? config.run : undefined;
	const expiry = new Date(run?.expiresAt ?? now + 3_600_000);
	return {
		enabled: config.enabled,
		runId: run?.runId ?? "",
		ownershipTopic: run?.ownershipTopic ?? "",
		expiresAt: new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60_000)
			.toISOString()
			.slice(0, -1),
		customers: run?.customers.map((customer) => ({
			...customer,
			rowId: crypto.randomUUID(),
		})) ?? [createBalanceShadowCustomerRow()],
	};
};

export const buildBalanceShadowConfig = ({
	values,
	now = Date.now(),
}: {
	values: BalanceShadowFormValues;
	now?: number;
}):
	| { success: true; config: BalanceShadowConfig }
	| { success: false; error: string } => {
	if (!values.enabled) return { success: true, config: { enabled: false } };
	const run = {
		runId: values.runId.trim(),
		ownershipTopic: values.ownershipTopic.trim(),
		expiresAt: new Date(values.expiresAt).getTime(),
		customers: values.customers.map((customer) => ({
			orgId: customer.orgId.trim(),
			env: customer.env,
			customerId: customer.customerId.trim(),
			featureId: customer.featureId.trim(),
		})),
	};
	for (const [label, value] of [
		["Run ID", run.runId],
		["Ownership topic", run.ownershipTopic],
	]) {
		if (value.length === 0 || value.length > 200)
			return { success: false, error: `${label} must be 1–200 characters.` };
	}
	if (
		!Number.isFinite(run.expiresAt) ||
		run.expiresAt <= now ||
		run.expiresAt > now + 86_400_000
	) {
		return {
			success: false,
			error: "Expiry must be within the next 24 hours.",
		};
	}
	if (
		run.customers.length < 1 ||
		run.customers.length > BALANCE_SHADOW_MAX_CUSTOMERS
	) {
		return { success: false, error: "Add 1–20 customer-feature entries." };
	}
	const identities = new Set<string>();
	for (const [index, customer] of run.customers.entries()) {
		if (
			[customer.orgId, customer.customerId, customer.featureId].some(
				(value) => value.length === 0 || value.length > 200,
			)
		) {
			return {
				success: false,
				error: `Entry ${index + 1}: org, customer and feature IDs must be 1–200 characters.`,
			};
		}
		const identity = JSON.stringify([
			customer.orgId,
			customer.env,
			customer.customerId,
			customer.featureId,
		]);
		if (identities.has(identity))
			return {
				success: false,
				error: `Duplicate customer-feature entry at row ${index + 1}.`,
			};
		identities.add(identity);
	}
	if (new TextEncoder().encode(JSON.stringify(run)).byteLength > 16_384) {
		return {
			success: false,
			error: "Shadow config exceeds 16 KiB. Use fewer entries or shorter IDs.",
		};
	}
	return { success: true, config: { enabled: true, run } };
};
