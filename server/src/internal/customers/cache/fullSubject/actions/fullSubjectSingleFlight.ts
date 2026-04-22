import type { AppEnv } from "@autumn/shared";

const inFlight = new Map<string, Promise<unknown>>();

export const buildFullSubjectSingleFlightKey = ({
	orgId,
	env,
	customerId,
	entityId,
	variant,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
	entityId?: string;
	variant: "full" | "partial";
}) => `${variant}:${orgId}:${env}:${customerId}:${entityId ?? ""}`;

export const runFullSubjectSingleFlight = async <T>({
	key,
	load,
}: {
	key: string;
	load: () => Promise<T>;
}): Promise<T> => {
	const existing = inFlight.get(key) as Promise<T> | undefined;
	if (existing) return structuredClone(await existing);

	const promise = load().finally(() => {
		inFlight.delete(key);
	});
	inFlight.set(key, promise);
	return structuredClone(await promise);
};
