import Conf from "conf";

const VALID_KEYS = ["noDeclarationFile"] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

const BOOLEAN_KEYS: ConfigKey[] = ["noDeclarationFile"];

function getStore() {
	return new Conf({ projectName: "atmn", projectSuffix: "" });
}

/** Read a single key from global config */
export function getGlobalConfig(): Conf {
	return getStore();
}

/**
 * atmn config command — git-config style, always headless.
 * `atmn config --global <key> [value]`
 */
function printHelp() {
	const store = getStore();
	console.log("Usage: atmn config --global <key> [value]");
	console.log(`Location: ${store.path}`);
	console.log("");
	console.log("Supported keys:");
	for (const key of VALID_KEYS) {
		console.log(`  ${key}`);
	}
}

export function configCommand(args: string[], flags: { global?: boolean }) {
	const [key, value] = args;

	if (!flags.global || !key) {
		printHelp();
		return;
	}

	const store = getStore();

	if (!VALID_KEYS.includes(key as ConfigKey)) {
		console.error(`error: unknown key '${key}'`);
		console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
		process.exit(1);
	}

	// Read
	if (value === undefined) {
		const val = store.get(key);
		if (val !== undefined) {
			console.log(String(val));
		}
		return;
	}

	// Write
	if (BOOLEAN_KEYS.includes(key as ConfigKey)) {
		if (value !== "true" && value !== "false") {
			console.error(`error: '${key}' expects 'true' or 'false', got '${value}'`);
			process.exit(1);
		}
		store.set(key, value === "true");
	} else {
		store.set(key, value);
	}
}
