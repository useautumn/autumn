import { buildRoleExistsError } from "./buildRoleExistsError.js";

const ROLE_ID_CONSTRAINT = "organization_role_org_role_key";

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

/** A concurrent create can pass the id check first; the unique key is the backstop, reported as 409. */
export const withRoleIdConflictAsRoleExists = async <T>({
	id,
	write,
}: {
	id: string;
	write: () => Promise<T>;
}): Promise<T> => {
	try {
		return await write();
	} catch (error) {
		if (violatedConstraint(error) === ROLE_ID_CONSTRAINT) {
			throw buildRoleExistsError({ id });
		}
		throw error;
	}
};
