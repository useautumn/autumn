import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { AppEnv, CusProductStatus, type FullSubject } from "@autumn/shared";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import type { ReplayHydrationSourceResult } from "../replayHydrationContracts.js";

export type ReplayHydrationRefusal = Extract<
	ReplayHydrationSourceResult,
	{ kind: "refused" }
>;

type SelectableEntitlement = Readonly<{
	next_reset_at?: number | null;
	expires_at?: number | null;
	entitlement: { feature: { id: string } };
}>;

const SELECTABLE_STATUSES = [CusProductStatus.Active, CusProductStatus.PastDue];
const MISSING_CONVERTER_REASONS = new Set(["feature_not_found"]);
const UNKNOWN_CONVERTER_REASON = "unsupported_subject_state";

export function refuseMissing({
	reason,
}: {
	reason: string;
}): ReplayHydrationRefusal {
	return { kind: "refused", category: "missing", reason };
}

export function refuseUnsupported({
	reason,
}: {
	reason: string;
}): ReplayHydrationRefusal {
	return { kind: "refused", category: "unsupported", reason };
}

/** The logical run end must stay representable, so both the baseline and the
 *  end of the replay window have to be safe integers. */
export function isSupportedBaseline({
	capturedAtMs,
	replayWindowMs,
}: {
	capturedAtMs: number;
	replayWindowMs: number;
}): boolean {
	return (
		Number.isSafeInteger(capturedAtMs) &&
		capturedAtMs >= 0 &&
		Number.isSafeInteger(capturedAtMs + replayWindowMs)
	);
}

/** A copied production row keeps its logical env, so live is legitimate here. */
export function toReplayAppEnv({ env }: { env: string }): AppEnv | undefined {
	for (const candidate of Object.values(AppEnv))
		if (candidate === env) return candidate;
	return undefined;
}

export function subjectMatchesIdentity({
	fullSubject,
	identity,
}: {
	fullSubject: FullSubject;
	identity: MeteringIdentity;
}): boolean {
	const { customer } = fullSubject;
	return (
		fullSubject.customerId === identity.customerId &&
		customer.id === identity.customerId &&
		customer.org_id === identity.orgId &&
		customer.env === identity.env
	);
}

export function stateMatchesIdentity({
	state,
	identity,
}: {
	state: SubjectState;
	identity: MeteringIdentity;
}): boolean {
	return (
		state.identity.orgId === identity.orgId &&
		state.identity.env === identity.env &&
		state.identity.customerId === identity.customerId
	);
}

function collectSelectableEntitlements({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): SelectableEntitlement[] {
	const fromCustomerProducts = fullSubject.customer_products
		.filter((customerProduct) =>
			SELECTABLE_STATUSES.includes(customerProduct.status),
		)
		.flatMap((customerProduct) => customerProduct.customer_entitlements);
	return [
		...fromCustomerProducts,
		...fullSubject.extra_customer_entitlements,
		...(fullSubject.pooled_customer_entitlements ?? []),
	];
}

/** Raw row lifecycle. The converter already refuses rows that are invalid at
 *  the baseline; this refuses rows whose reset or expiry lands at or before the
 *  logical run end, because the frozen snapshot cannot serve them. */
export function hasLifecycleWindowViolation({
	fullSubject,
	featureIds,
	runEndMs,
}: {
	fullSubject: FullSubject;
	featureIds: readonly string[];
	runEndMs: number;
}): boolean {
	const selectedFeatureIds = new Set(featureIds);
	for (const entitlement of collectSelectableEntitlements({ fullSubject })) {
		if (!selectedFeatureIds.has(entitlement.entitlement.feature.id)) continue;
		const boundaries = [entitlement.next_reset_at, entitlement.expires_at];
		if (boundaries.some((boundary) => boundary != null && boundary <= runEndMs))
			return true;
	}
	return false;
}

function converterReasonOf({
	cause,
}: {
	cause: BalanceWorkerUnsupportedError;
}): string {
	const { data } = cause;
	if (typeof data !== "object" || data === null)
		return UNKNOWN_CONVERTER_REASON;
	const { reason } = data as { reason?: unknown };
	return typeof reason === "string" ? reason : UNKNOWN_CONVERTER_REASON;
}

/** Only the existing converter refusals become source refusals. Real SQL or
 *  programming failures keep propagating as failures. */
export function refusalFromConverterError({
	cause,
}: {
	cause: unknown;
}): ReplayHydrationRefusal | undefined {
	if (!(cause instanceof BalanceWorkerUnsupportedError)) return undefined;
	const reason = converterReasonOf({ cause });
	return MISSING_CONVERTER_REASONS.has(reason)
		? refuseMissing({ reason })
		: refuseUnsupported({ reason });
}
