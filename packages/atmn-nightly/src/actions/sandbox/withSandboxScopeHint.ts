import { AutumnApiError } from "../../generated/client";

const SCOPE_REFUSAL = "Insufficient scopes";

export const SANDBOX_LOGIN_HINT =
	"Your key can't manage sandboxes: it was minted before atmn asked for platform:write. Run atmn login again to mint one that can.";

export const SETTINGS_LOGIN_HINT =
	"Your key can't write settings: it was minted before atmn asked for organisation:write. Run atmn login again to mint one that can, or drop the settings block.";

/** A key minted by an older login fails here first; say what to do, not just which scope is missing. */
export const withSandboxScopeHint = ({ error }: { error: unknown }): unknown =>
	withScopeHint({ error, hint: SANDBOX_LOGIN_HINT });

export const withSettingsScopeHint = ({ error }: { error: unknown }): unknown =>
	withScopeHint({ error, hint: SETTINGS_LOGIN_HINT });

const withScopeHint = ({
	error,
	hint,
}: {
	error: unknown;
	hint: string;
}): unknown =>
	error instanceof AutumnApiError && error.message.includes(SCOPE_REFUSAL)
		? new Error(hint, { cause: error })
		: error;
