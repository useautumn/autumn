import { join } from "node:path";

export const buildCaseEnv = ({
	cwd,
	extraEnv,
}: {
	cwd: string;
	extraEnv?: Record<string, string>;
}): Record<string, string | undefined> => {
	const env: Record<string, string | undefined> = {
		...process.env,
		...extraEnv,
		PATH: `${join(cwd, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
	};
	delete env.AUTUMN_SECRET_KEY;
	delete env.AUTUMN_PROD_SECRET_KEY;
	return env;
};
