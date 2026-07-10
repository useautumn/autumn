// Shared helpers for the role-management scripts (set-critical-role-timeouts,
// create-neon-events-readonly-role) so arg parsing / quoting / Infisical loading can't drift.

export const quoteIdent = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export const getArg = (name: string) => {
	const prefix = `${name}=`;
	const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);

	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
};

type InfisicalSecret = {
	key?: string;
	value?: string;
	secretKey?: string;
	secretValue?: string;
};

const setEnvFromInfisicalExport = (value: unknown) => {
	if (Array.isArray(value)) {
		for (const secret of value as InfisicalSecret[]) {
			const key = secret.key ?? secret.secretKey;
			const secretValue = secret.value ?? secret.secretValue;
			if (key && secretValue) {
				process.env[key] = secretValue;
			}
		}
		return;
	}

	for (const [key, secretValue] of Object.entries(
		value as Record<string, string>,
	)) {
		process.env[key] = secretValue;
	}
};

export const loadInfisicalEnv = (env: string) => {
	const result = Bun.spawnSync([
		"infisical",
		"secrets",
		"--env",
		env,
		"--recursive",
		"--output",
		"json",
		"--silent",
	]);

	if (!result.success) {
		throw new Error(
			`Failed to load Infisical env "${env}": ${result.stderr.toString()}`,
		);
	}

	setEnvFromInfisicalExport(JSON.parse(result.stdout.toString()));
};
