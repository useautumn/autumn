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
	/** The pinned sandbox's name, when the CLI could look it up; the id is the fallback. */
	sandboxName?: string;
	/** Nothing is sent without this: the whole catalog goes. */
	yes?: boolean;
	write?: WriteLine;
};

export type ResetResult = { wiped: boolean };

/** What the copy calls the sandbox: the pinned one by name, or the main one. */
const targetName = ({
	target,
	sandboxName,
}: {
	target: Target;
	sandboxName: string | undefined;
}): string =>
	target.sandboxId === undefined
		? "your main sandbox"
		: sandboxName === undefined
			? `sandbox ${target.sandboxId}`
			: `sandbox ${sandboxName} (${target.sandboxId})`;

export const runReset = async ({
	client,
	target,
	sandboxName,
	yes = false,
	write = (text) => process.stdout.write(text),
}: ResetOptions): Promise<ResetResult> => {
	assertSandboxTarget({ target });

	const name = targetName({ target, sandboxName });

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
