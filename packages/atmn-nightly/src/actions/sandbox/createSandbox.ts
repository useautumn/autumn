import { writeEnvValues } from "../../env/loadEnv";
import { SANDBOX_PIN_NAME, sandboxKeyName } from "../../env/sandboxKeyName";
import type {
	CreateSandboxParams,
	CreateSandboxResponse,
} from "../../generated/client";
import { stripTerminalControls } from "../../render/stripTerminalControls";
import type { SandboxClient, WriteLine } from "./types/sandboxClient";

export type SandboxCreateOptions = {
	client: SandboxClient;
	name: string;
	color?: CreateSandboxParams["color"];
	icon?: string;
	/** Also pin AUTUMN_SANDBOX_ID, so later commands target the new sandbox. */
	use?: boolean;
	json?: boolean;
	/** Where to look for the .env the key is written to. */
	envDirs: string[];
	write?: WriteLine;
	writeError?: WriteLine;
};

export type SandboxCreateResult = {
	sandbox: CreateSandboxResponse;
	envPath: string;
	keyName: string;
};

export const runSandboxCreate = async ({
	client,
	name,
	color,
	icon,
	use = false,
	json = false,
	envDirs,
	write = (text) => process.stdout.write(text),
	writeError = (text) => process.stderr.write(text),
}: SandboxCreateOptions): Promise<SandboxCreateResult> => {
	const sandbox = await client.createSandbox({
		name,
		...(color === undefined ? {} : { color }),
		...(icon === undefined ? {} : { icon }),
	});

	// The key is readable exactly once, in this response: it reaches disk
	// before anything else can fail.
	const keyName = sandboxKeyName({ sandboxId: sandbox.id });
	let envPath: string;
	try {
		envPath = writeEnvValues({
			dirs: envDirs,
			values: {
				[keyName]: sandbox.secretKey,
				...(use ? { [SANDBOX_PIN_NAME]: sandbox.id } : {}),
			},
		});
	} catch (error) {
		// The key exists nowhere else: show it before the failure takes it, on
		// stderr under --json so stdout stays parseable.
		(json ? writeError : write)(
			`Could not write your .env. Save this key yourself:\n${keyName}=${sandbox.secretKey}\n`,
		);
		throw error;
	}

	if (json) {
		write(`${JSON.stringify(sandbox, null, 2)}\n`);
		return { sandbox, envPath, keyName };
	}

	write(
		`Created sandbox ${stripTerminalControls(sandbox.name)} (${sandbox.id}).\nSaved its key to ${envPath} as ${keyName}.\n`,
	);
	if (use) {
		write(
			`Pinned ${SANDBOX_PIN_NAME}=${sandbox.id}; every command targets it until you change it.\n`,
		);
	}

	return { sandbox, envPath, keyName };
};
