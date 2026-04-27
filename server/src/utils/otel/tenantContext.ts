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
	full_subject_rollout_enabled?: boolean;
};

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
