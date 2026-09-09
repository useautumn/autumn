import {
	readEnvFileValue,
	removeEnvValues,
	writeEnvValues,
} from "../../env/loadEnv";
import { SANDBOX_PIN_NAME, sandboxKeyName } from "../../env/sandboxKeyName";
import { done, type Prompter } from "../../prompt/prompt";
import { type Choice, matchChoice, select } from "../../prompt/select";
import { renderSandboxes, type SandboxRow } from "../../render/renderSandboxes";
import { stripTerminalControls } from "../../render/stripTerminalControls";
import type { OrgInfo } from "../env/types/orgInfo";
import type { UseSandboxClient } from "./types/sandboxClient";

export type SandboxUseOptions = {
	client: UseSandboxClient;
	/** The main organization, as `/organization/me` answered for the main key. */
	org: Pick<OrgInfo, "id" | "name" | "slug">;
	/** A name or an id; asked for when absent and interactive. */
	query?: string;
	/** Drop the pin instead of setting one. */
	clear?: boolean;
	json?: boolean;
	/** Where the .env lives; the first existing file is used, else the first dir. */
	envDirs: string[];
	prompter: Prompter;
};

export type SandboxUseResult = {
	organization: Pick<OrgInfo, "id" | "name" | "slug">;
	sandbox: { id: string; name: string; slug: string };
	keyName: string;
	keyMinted: boolean;
	envPath: string;
	notes: string[];
};

const choicesOf = ({
	sandboxes,
	currentId,
}: {
	sandboxes: SandboxRow[];
	currentId: string | undefined;
}): Choice[] =>
	sandboxes.map((sandbox) => ({
		value: sandbox.id,
		label: stripTerminalControls(sandbox.name),
		detail: sandbox.id,
		current: sandbox.id === currentId,
	}));

const notesFor = ({ name }: { name: string }): string[] => [
	`Every atmn command now targets sandbox ${name}.`,
	"Run `atmn env` to confirm; `atmn sandbox use --clear` returns to the main sandbox.",
	"`atmn push` previews only; add --yes to apply.",
];

/**
 * The pin is the only per-project state a sandbox needs: `--sandbox` and the
 * key name derive from it. A key is minted when this machine has none for
 * the sandbox, so a teammate's sandbox is one command away.
 */
export const runSandboxUse = async ({
	client,
	org,
	query,
	clear = false,
	json = false,
	envDirs,
	prompter,
}: SandboxUseOptions): Promise<SandboxUseResult | null> => {
	if (clear) {
		removeEnvValues({ dirs: envDirs, keys: [SANDBOX_PIN_NAME] });
		prompter.write(
			`${done(`Cleared ${SANDBOX_PIN_NAME}; commands target the main sandbox again.`)}\n`,
		);
		return null;
	}

	const { list } = await client.listSandboxes({});
	const currentId = process.env[SANDBOX_PIN_NAME];
	const choices = choicesOf({ sandboxes: list, currentId });

	let picked: Choice | null;
	if (query !== undefined && query !== "") {
		picked = matchChoice({ choices, query });
		if (picked === null)
			throw new Error(
				`No sandbox named or with id ${JSON.stringify(query)}. Run atmn sandbox list.`,
			);
	} else {
		if (!prompter.interactive)
			prompter.write(
				`${renderSandboxes({ sandboxes: list, currentSandboxId: currentId })}\n`,
			);
		picked = await select({
			prompter,
			choices,
			question: "Which sandbox?",
			flag: "atmn sandbox use <name|id>",
		});
		if (picked === null) return null;
	}

	const sandbox = list.find((row) => row.id === picked.value);
	if (sandbox === undefined) throw new Error("Sandbox vanished from the list.");
	const keyName = sandboxKeyName({ sandboxId: sandbox.id });
	const name = stripTerminalControls(sandbox.name);

	const onDisk =
		process.env[keyName] ?? readEnvFileValue({ dirs: envDirs, key: keyName });
	let keyMinted = false;
	const values: Record<string, string> = { [SANDBOX_PIN_NAME]: sandbox.id };
	if (onDisk === undefined) {
		const minted = await client.createSandboxKey({ id: sandbox.id });
		values[keyName] = minted.secretKey;
		keyMinted = true;
	}
	const envPath = writeEnvValues({ dirs: envDirs, values });

	const result: SandboxUseResult = {
		organization: { id: org.id, name: org.name, slug: org.slug },
		sandbox: { id: sandbox.id, name: sandbox.name, slug: sandbox.slug },
		keyName,
		keyMinted,
		envPath,
		notes: notesFor({ name }),
	};

	if (json) {
		prompter.write(`${JSON.stringify(result, null, 2)}\n`);
		return result;
	}

	if (keyMinted)
		prompter.write(`${done(`Minted a key for ${name} (${sandbox.id})`)}\n`);
	prompter.write(
		`${done(`Pinned ${SANDBOX_PIN_NAME}=${sandbox.id} in ${envPath}`)}\n`,
	);
	prompter.write(
		`  Every command now targets ${name}. atmn sandbox use --clear returns to the main sandbox.\n`,
	);
	return result;
};
