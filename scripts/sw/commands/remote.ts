import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	PROVISION_SH,
	REMOTE_WORKTREES_SUBDIR,
	SCRIPT_DIR,
} from "../constants.ts";
import { createVm, scpTo, vmCapture, vmExec } from "../helpers/exe.ts";
import { execForeground } from "../helpers/exec.ts";
import { originUrl, pushBranch, toSshOrigin } from "../helpers/git.ts";
import { exportDevDotenv } from "../helpers/infisical.ts";
import { layoutPanes } from "../helpers/layout.ts";
import { createSwBranch } from "../helpers/neon.ts";
import { upsertEntry } from "../helpers/registry.ts";
import { fatal, log } from "../helpers/shell.ts";
import { sshExecArgs, sshShellCommand } from "../helpers/ssh.ts";
import { serverTmuxScript } from "../helpers/tmux.ts";
import type { Target, WorktreeContext } from "../types.ts";

const shQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Remote target: push the branch, issue a Neon branch from the Mac, create an
 * exe.dev VM, provision native services on it (no Docker), then drive the panes
 * via explicit ssh — the claude pane ssh's in, this pane hosts the dev server.
 */
export async function cmdRemote({
	checkout,
	branch,
	slug,
	target,
}: WorktreeContext & { target: Exclude<Target, "local"> }): Promise<void> {
	if (target !== "exe") {
		fatal(`target '${target}' is not implemented yet (exe.dev only)`);
	}

	pushBranch(checkout, branch);
	const neon = createSwBranch(slug);
	const vmName = `sw-${slug}`.slice(0, 40);
	const vm = createVm(vmName);

	const remoteHome = vmCapture(vm.ssh_dest, "echo $HOME");
	const remotePath = `${remoteHome}/${REMOTE_WORKTREES_SUBDIR}/${slug}`;

	const baseEnv = exportDevDotenv(checkout);
	const baseEnvLocal = join(tmpdir(), `sw-env-${slug}`);
	writeFileSync(baseEnvLocal, baseEnv);

	const provisionRemote = "/tmp/sw-provision.sh";
	const hookRemote = "/tmp/sw-herdr-agent-state.sh";
	const baseEnvRemote = "/tmp/sw-base.env";
	scpTo(vm.ssh_dest, PROVISION_SH, provisionRemote);
	scpTo(
		vm.ssh_dest,
		join(SCRIPT_DIR, "remote/herdr-agent-state.sh"),
		hookRemote,
	);
	scpTo(vm.ssh_dest, baseEnvLocal, baseEnvRemote);

	const originSsh = toSshOrigin(originUrl(checkout));
	const args = [
		remotePath,
		branch,
		originSsh,
		neon.databaseUrl,
		slug,
		hookRemote,
		baseEnvRemote,
	]
		.map(shQuote)
		.join(" ");

	log(`provisioning ${vm.ssh_dest} (native services, no docker)`);
	const code = vmExec(vm.ssh_dest, `bash ${provisionRemote} ${args}`, {
		agentForward: true,
	});
	if (code !== 0) fatal("remote provisioning failed");

	upsertEntry({
		path: checkout,
		branch,
		slug,
		target: "exe",
		createdAt: Date.now(),
		host: vm.ssh_dest,
		remotePath,
		neonBranchId: neon.id,
		neonBranchName: neon.name,
		vmName: vm.name,
	});

	// claude pane ssh's into the box; this (server) pane hosts `bun dev` in tmux.
	const self = process.env.HERDR_PANE_ID;
	if (self) {
		layoutPanes(
			self,
			sshShellCommand(vm.ssh_dest, `cd ${shQuote(remotePath)} && exec claude`),
		);
	}

	const serverScript = serverTmuxScript({
		slug,
		dir: remotePath,
		runCmd: "bun dev",
	});
	execForeground("ssh", sshExecArgs(vm.ssh_dest, serverScript));
}
