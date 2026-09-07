import { AutumnApiError } from "../../generated/client";

const SCOPE_REFUSAL = "Insufficient scopes";

export const SANDBOX_LOGIN_HINT =
	"Your key can't manage sandboxes: it was minted before atmn asked for platform:write. Run atmn login again to mint one that can.";

/** A key minted by an older login fails here first; say what to do, not just which scope is missing. */
export const withSandboxScopeHint = ({ error }: { error: unknown }): unknown =>
	error instanceof AutumnApiError && error.message.includes(SCOPE_REFUSAL)
		? new Error(SANDBOX_LOGIN_HINT, { cause: error })
		: error;
