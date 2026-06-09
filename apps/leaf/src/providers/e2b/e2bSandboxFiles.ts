import type { SandboxFile } from "../../agent/sandbox/types.js";
import type { E2bSandbox } from "./e2bSandboxLifecycle.js";

export const e2bWorkDir = "/work";

export const ensureE2bWorkDir = async ({
	sandbox,
}: {
	sandbox: E2bSandbox;
}) => {
	try {
		await sandbox.files.makeDir(e2bWorkDir);
	} catch (error) {
		if (!(error instanceof Error) || !/exist/i.test(error.message)) throw error;
	}
};

export const writeE2bSandboxFiles = async ({
	files,
	sandbox,
}: {
	files: SandboxFile[];
	sandbox: E2bSandbox;
}) => {
	for (const file of files) {
		await sandbox.files.write(file.path, file.content);
	}
};

export const readRequestedE2bFiles = async ({
	returnFiles,
	sandbox,
}: {
	returnFiles: string[];
	sandbox: E2bSandbox;
}): Promise<SandboxFile[]> => {
	const files: SandboxFile[] = [];
	for (const filePath of returnFiles) {
		if (!(await sandbox.files.exists(filePath))) continue;
		files.push({
			path: filePath,
			content: await sandbox.files.read(filePath),
		});
	}
	return files;
};
