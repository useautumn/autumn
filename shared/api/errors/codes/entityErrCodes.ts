export const EntityErrorCode = {
	EntityNotFound: "entity_not_found",
} as const;

export type EntityErrorCode =
	(typeof EntityErrorCode)[keyof typeof EntityErrorCode];
