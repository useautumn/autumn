import { assertSandboxTarget } from "../../env/assertSandboxTarget";
import type { Target } from "../../env/resolveTarget";
import type { AutumnClient } from "../../generated/client";
import type { WriteLine } from "../sandbox/types/sandboxClient";

/** The one operation `atmn reset` needs, so a test can hand over a fake. */
export type ResetClient = Pick<AutumnClient, "resetSandbox">;

export type ResetOptions = {
	client: ResetClient;
	/** Which sandbox is wiped: reset acts on whatever the key belongs to. */
	target: Target;
	/** Nothing is sent without this: the whole catalog goes. */
	yes?: boolean;
	write?: WriteLine;
};

export type ResetResult = { wiped: boolean };

/** What the copy calls the sandbox: the pinned one, or the org's default. */
const targetName = ({ target }: { target: Target }): string =>
	target.sandboxId === undefined
		? "your default sandbox"
		: `sandbox ${target.sandboxId}`;

export const runReset = async ({
	client,
	target,
	yes = false,
	write = (text) => process.stdout.write(text),
}: ResetOptions): Promise<ResetResult> => {
	assertSandboxTarget({ target });

	const name = targetName({ target });

	if (!yes) {
		write(
			`This wipes ${name}: every customer, plan, feature and migration draft. Keys and settings stay. Re-run with --yes to wipe.\n`,
		);
		return { wiped: false };
	}

	await client.resetSandbox({});

	write(`Wiped ${name}. Run atmn push to rebuild it from your config.\n`);
	return { wiped: true };
};
