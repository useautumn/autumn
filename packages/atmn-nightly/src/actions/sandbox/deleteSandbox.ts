import { readEnvFileValue, removeEnvValues } from "../../env/loadEnv";
import { SANDBOX_PIN_NAME, sandboxKeyName } from "../../env/sandboxKeyName";
import type { SandboxRow } from "../../render/renderSandboxes";
import type { SandboxClient, WriteLine } from "./types/sandboxClient";

export type SandboxDeleteOptions = {
	client: SandboxClient;
	id: string;
	/** Nothing is sent without this: delete takes the catalog and the customers too. */
	yes?: boolean;
	/** Where to look for the .env the sandbox's key is scrubbed from. */
	envDirs: string[];
	write?: WriteLine;
};

export type SandboxDeleteResult = {
	deleted: boolean;
	sandbox: SandboxRow;
	/** The .env that changed, when the sandbox had a key or the pin there. */
	envPath?: string;
};

/** The pin only goes when it pointed here; another sandbox may own it. */
const scrubbedKeys = ({
	sandboxId,
	envDirs,
}: {
	sandboxId: string;
	envDirs: string[];
}): string[] => {
	const pinnedId = readEnvFileValue({ dirs: envDirs, key: SANDBOX_PIN_NAME });
	return [
		sandboxKeyName({ sandboxId }),
		...(pinnedId === sandboxId ? [SANDBOX_PIN_NAME] : []),
	];
};

export const runSandboxDelete = async ({
	client,
	id,
	yes = false,
	envDirs,
	write = (text) => process.stdout.write(text),
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
			`This deletes sandbox ${sandbox.name} (${sandbox.id}) and everything in it. Re-run with --yes to delete.\n`,
		);
		return { deleted: false, sandbox };
	}

	await client.deleteSandbox({ id: sandbox.id });
	const envPath = removeEnvValues({
		dirs: envDirs,
		keys: scrubbedKeys({ sandboxId: sandbox.id, envDirs }),
	});

	write(`Deleted sandbox ${sandbox.name} (${sandbox.id}).\n`);
	if (envPath !== undefined) write(`Dropped its key from ${envPath}.\n`);
	return {
		deleted: true,
		sandbox,
		...(envPath === undefined ? {} : { envPath }),
	};
};
