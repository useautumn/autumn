export function resolvePlanEntityId({
	planEntityId,
	defaultEntityId,
}: {
	planEntityId?: string | null;
	defaultEntityId?: string;
}) {
	if (planEntityId === null) return undefined;
	return planEntityId ?? defaultEntityId;
}
