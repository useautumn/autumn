import {
	context,
	createContextKey,
	type Context as OtelContext,
} from "@opentelemetry/api";

export type TenantAttrs = {
	req_id?: string;
	org_id?: string;
	org_slug?: string;
	env?: string;
	customer_id?: string;
	entity_id?: string;
	user_id?: string;
	auth_type?: string;
	api_version?: string;
	region?: string;
	balance_worker_rollout_enabled?: boolean;
};

/** Every key of TenantAttrs, for code that needs to tell them from a span's own attributes. */
export const TENANT_ATTR_KEYS: ReadonlyArray<keyof TenantAttrs> = [
	"req_id",
	"org_id",
	"org_slug",
	"env",
	"customer_id",
	"entity_id",
	"user_id",
	"auth_type",
	"api_version",
	"region",
	"balance_worker_rollout_enabled",
];

export const TENANT_CONTEXT_KEY = createContextKey("autumn.tenant");

export const withTenantContext = <T>({
	attrs,
	fn,
}: {
	attrs: TenantAttrs;
	fn: () => T;
}): T => {
	const activeContext = context.active();
	const nextContext = activeContext.setValue(TENANT_CONTEXT_KEY, attrs);
	return context.with(nextContext, fn);
};

export const getTenantAttrs = (ctx: OtelContext): TenantAttrs | undefined => {
	return ctx.getValue(TENANT_CONTEXT_KEY) as TenantAttrs | undefined;
};
