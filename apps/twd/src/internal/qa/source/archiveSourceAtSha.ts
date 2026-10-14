import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../../catalog/actions/gitRemote.ts";
import {
	fetchShaIntoMirror,
	withMirror,
} from "../../catalog/mirror/gitMirror.ts";

const EXCLUDED_PATHS = ["apps/website/public", "apps/docs/mintlify/images"];

export const archiveSourceAtSha = async ({ sha }: { sha: string }) => {
	const dir = await mkdtemp(join(tmpdir(), "twd-qa-src-"));
	const output = join(dir, "src.tar.gz");
	await withMirror(async (mirrorDir) => {
		await fetchShaIntoMirror({ mirrorDir, sha });
		await runGit({
			args: [
				"archive",
				"--format=tar.gz",
				`--output=${output}`,
				sha,
				"--",
				".",
				...EXCLUDED_PATHS.map((path) => `:(exclude)${path}`),
			],
			cwd: mirrorDir,
		});
	});
	const tarball = new Blob([await Bun.file(output).arrayBuffer()], {
		type: "application/gzip",
	});
	await rm(dir, { recursive: true, force: true });
	return tarball;
};
