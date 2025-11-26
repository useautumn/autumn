export const EntityErrorCode = {
	EntityNotFound: "entity_not_found",
	EntityAlreadyExists: "entity_already_exists",
} as const;

export type EntityErrorCode =
	(typeof EntityErrorCode)[keyof typeof EntityErrorCode];
