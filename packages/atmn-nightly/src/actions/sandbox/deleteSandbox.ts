import { removeEnvValues, removeEnvValueWhen } from "../../env/loadEnv";
import { SANDBOX_PIN_NAME, sandboxKeyName } from "../../env/sandboxKeyName";
import type { SandboxRow } from "../../render/renderSandboxes";
import { stripTerminalControls } from "../../render/stripTerminalControls";
import type { SandboxClient, WriteLine } from "./types/sandboxClient";

export type SandboxDeleteOptions = {
	client: SandboxClient;
	id: string;
	/** Nothing is sent without this: delete takes the catalog and the customers too. */
	yes?: boolean;
	/** Where to look for the .env the sandbox's key is scrubbed from. */
	envDirs: string[];
	write?: WriteLine;
	writeError?: WriteLine;
};

export type SandboxDeleteResult = {
	deleted: boolean;
	sandbox: SandboxRow;
	/** Every .env that changed; empty when the sandbox had no key or pin on disk. */
	envPaths: string[];
};

/** The key goes from every file holding it; the pin only where it pointed
 * here, since another sandbox may own it in another file. */
const scrubSandboxFromEnv = ({
	sandboxId,
	envDirs,
}: {
	sandboxId: string;
	envDirs: string[];
}): string[] => {
	const scrubbed = [
		...removeEnvValues({
			dirs: envDirs,
			keys: [sandboxKeyName({ sandboxId })],
		}),
		...removeEnvValueWhen({
			dirs: envDirs,
			key: SANDBOX_PIN_NAME,
			equals: sandboxId,
		}),
	];
	return [...new Set(scrubbed)];
};

export const runSandboxDelete = async ({
	client,
	id,
	yes = false,
	envDirs,
	write = (text) => process.stdout.write(text),
	writeError = (text) => process.stderr.write(text),
}: SandboxDeleteOptions): Promise<SandboxDeleteResult> => {
	// Listing first names the sandbox in the copy, and turns a typo into an
	// error instead of a request the server has to refuse.
	const { list } = await client.listSandboxes({});
	const sandbox = list.find((entry) => entry.id === id);
	if (sandbox === undefined) {
		throw new Error(`No sandbox with id ${id}. Run atmn sandbox list.`);
	}

	if (!yes) {
		write(
			`This deletes sandbox ${stripTerminalControls(sandbox.name)} (${sandbox.id}) and everything in it. Re-run with --yes to delete.\n`,
		);
		return { deleted: false, sandbox, envPaths: [] };
	}

	await client.deleteSandbox({ id: sandbox.id });
	// The remote delete is done and cannot be undone: say so before anything
	// local can fail, so a .env error never reads as a failed deletion.
	write(
		`Deleted sandbox ${stripTerminalControls(sandbox.name)} (${sandbox.id}).\n`,
	);

	let envPaths: string[];
	try {
		envPaths = scrubSandboxFromEnv({ sandboxId: sandbox.id, envDirs });
	} catch (error) {
		writeError(
			`Sandbox ${sandbox.id} is gone, but its .env could not be rewritten. Remove the line ${sandboxKeyName({ sandboxId: sandbox.id })}=... by hand, and ${SANDBOX_PIN_NAME}=${sandbox.id} if it is there.\n`,
		);
		throw error;
	}

	if (envPaths.length > 0)
		write(`Dropped its key from ${envPaths.join(", ")}.\n`);
	return { deleted: true, sandbox, envPaths };
};
