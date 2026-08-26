import type { FreeTrialDuration } from "@autumn/shared";

type RequestBody = Record<string, unknown>;

/** One reader per form field: given the request, produce the field's value or
 * undefined to leave the form default alone. */
export type FieldReaders<Form> = {
	[K in keyof Form]?: (request: RequestBody) => Form[K] | undefined;
};

/** Applies a reader table, keeping only the fields a reader resolved — the
 * whole wire→form mapping reads as one declarative table per form. */
export const overridesFromRequest = <Form>(
	request: RequestBody,
	readers: FieldReaders<Form>,
): Partial<Form> => {
	const overrides: Partial<Form> = {};
	for (const key of Object.keys(readers) as Array<keyof Form>) {
		const value = readers[key]?.(request);
		if (value !== undefined) overrides[key] = value;
	}
	return overrides;
};

export const readString =
	(key: string) =>
	(request: RequestBody): string | undefined =>
		typeof request[key] === "string" ? (request[key] as string) : undefined;

/** For wire strings typed as enums/unions form-side; values come from the
 * same zod-validated request the server accepted. */
export const readEnum =
	<T extends string>(key: string) =>
	(request: RequestBody): T | undefined =>
		typeof request[key] === "string" ? (request[key] as T) : undefined;

export const readNumber =
	(key: string) =>
	(request: RequestBody): number | undefined =>
		typeof request[key] === "number" ? (request[key] as number) : undefined;

export const readBoolean =
	(key: string) =>
	(request: RequestBody): boolean | undefined =>
		typeof request[key] === "boolean" ? (request[key] as boolean) : undefined;

export const readArray =
	<T>(key: string) =>
	(request: RequestBody): T[] | undefined =>
		Array.isArray(request[key]) ? (request[key] as T[]) : undefined;

export const readStringArray =
	(key: string) =>
	(request: RequestBody): string[] | undefined =>
		Array.isArray(request[key])
			? (request[key] as unknown[]).filter(
					(value): value is string => typeof value === "string",
				)
			: undefined;

/** Array entries stamped with the `_id` the form's list components key by. */
export const readStampedArray =
	<T extends object>(key: string, idPrefix: string) =>
	(request: RequestBody): Array<T & { _id: string }> | undefined =>
		Array.isArray(request[key])
			? (request[key] as T[]).map((entry, index) => ({
					...entry,
					_id: `${idPrefix}-${index}`,
				}))
			: undefined;

/** `[{<idKey>, quantity}]` wire lists become the form's id→quantity record. */
export const readQuantities =
	(key: string, idKey: string) =>
	(request: RequestBody): Record<string, number> | undefined => {
		const quantities = quantityRecordFrom(request[key], idKey);
		return Object.keys(quantities).length ? quantities : undefined;
	};

export const requestRecord = (
	value: unknown,
): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

export const quantityRecordFrom = (
	value: unknown,
	idKey: string,
): Record<string, number> => {
	if (!Array.isArray(value)) return {};
	return Object.fromEntries(
		value.flatMap((entry) => {
			const id = requestRecord(entry)?.[idKey];
			const quantity = requestRecord(entry)?.quantity;
			return typeof id === "string" && typeof quantity === "number"
				? [[id, quantity]]
				: [];
		}),
	);
};

export const anchorOverridesFrom = (
	value: unknown,
): {
	billingCycleAnchorMode?: "now" | "custom";
	billingCycleAnchorDate?: number;
	resetBillingCycle?: boolean;
} => {
	if (value === "now") {
		return { billingCycleAnchorMode: "now", resetBillingCycle: true };
	}
	if (typeof value === "number") {
		return {
			billingCycleAnchorDate: value,
			billingCycleAnchorMode: "custom",
			resetBillingCycle: true,
		};
	}
	return {};
};

/** The trial is documented at the top level of a billing request and defined
 * inside `customize`; the server honours both, so seeding a form must too.
 * `customize.free_trial` wins when both are present, matching the server. */
export const freeTrialFromRequest = (request: Record<string, unknown>) => {
	const customize = requestRecord(request.customize);
	return customize?.free_trial !== undefined
		? customize.free_trial
		: request.free_trial;
};

/** V0 trial shape → trial form fields; null means the trial is removed. */
export const trialOverridesFrom = (
	value: unknown,
	options: { removable?: boolean } = {},
): {
	removeTrial?: boolean;
	trialCardRequired?: boolean;
	trialDuration?: FreeTrialDuration;
	trialEnabled?: boolean;
	trialLength?: number;
	trialOnEnd?: "bill" | "revert";
} => {
	if (value === null) {
		return options.removable
			? { removeTrial: true, trialEnabled: false }
			: { trialEnabled: false };
	}
	const trial = requestRecord(value);
	// V1 names these duration_length/duration_type; V0 used length/duration.
	const length =
		typeof trial?.duration_length === "number"
			? trial.duration_length
			: trial?.length;
	const duration =
		typeof trial?.duration_type === "string"
			? trial.duration_type
			: trial?.duration;
	if (!trial || typeof length !== "number") return {};
	return {
		trialCardRequired: trial.card_required !== false,
		trialDuration: (typeof duration === "string"
			? duration
			: "day") as FreeTrialDuration,
		trialEnabled: true,
		trialLength: length,
		...(trial.on_end === "bill" || trial.on_end === "revert"
			? { trialOnEnd: trial.on_end }
			: {}),
	};
};
