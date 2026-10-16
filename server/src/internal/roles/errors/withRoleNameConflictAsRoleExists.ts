import { buildRoleExistsError } from "./buildRoleExistsError.js";

const ROLE_NAME_CONSTRAINT = "organization_role_org_role_key";

const violatedConstraint = (error: unknown): string | null => {
	if (typeof error !== "object" || error === null) return null;
	const { code, constraint, cause } = error as {
		code?: unknown;
		constraint?: unknown;
		cause?: unknown;
	};
	if (code === "23505" && typeof constraint === "string") return constraint;
	return violatedConstraint(cause ?? null);
};

/** A concurrent save can pass the name check first; the unique key is the backstop, reported as 409. */
export const withRoleNameConflictAsRoleExists = async <T>({
	name,
	write,
}: {
	name: string;
	write: () => Promise<T>;
}): Promise<T> => {
	try {
		return await write();
	} catch (error) {
		if (violatedConstraint(error) === ROLE_NAME_CONSTRAINT) {
			throw buildRoleExistsError({ name });
		}
		throw error;
	}
};
