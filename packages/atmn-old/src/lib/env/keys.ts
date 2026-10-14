import { AppEnv, isValidKey } from "./detect.js";
import { getDotenvValue } from "./dotenv.js";

export interface ApiKeys {
	[AppEnv.Sandbox]?: string;
	[AppEnv.Live]?: string;
}

export function readApiKeys(cwd?: string): ApiKeys {
	const keys: ApiKeys = {};
	const rootCwd = process.cwd();

	const getValue = (key: string): string | undefined => {
		if (cwd && cwd !== rootCwd) {
			const value = getDotenvValue(key, cwd);
			if (value) return value;
		}
		return getDotenvValue(key, rootCwd);
	};

	const autumnSecretKey = getValue("AUTUMN_SECRET_KEY");
	const autumnProdSecretKey = getValue("AUTUMN_PROD_SECRET_KEY");

	if (autumnSecretKey && isValidKey(autumnSecretKey)) {
		keys[AppEnv.Sandbox] = autumnSecretKey;
	}

	if (autumnProdSecretKey && isValidKey(autumnProdSecretKey)) {
		keys[AppEnv.Live] = autumnProdSecretKey;
	}

	return keys;
}

export function getKey(env: AppEnv, cwd?: string): string {
	const keys = readApiKeys(cwd);
	const key = keys[env];

	if (!key) {
		throw new Error(
			`No ${env} API key found. Run 'atmn login' to authenticate.`,
		);
	}

	return key;
}

export function hasKey(env: AppEnv, cwd?: string): boolean {
	const keys = readApiKeys(cwd);
	return !!keys[env];
}

export function getAnyKey(cwd?: string): string | undefined {
	const keys = readApiKeys(cwd);
	return keys[AppEnv.Sandbox] || keys[AppEnv.Live];
}
