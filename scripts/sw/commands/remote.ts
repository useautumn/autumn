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
import { writeMarker } from "../helpers/marker.ts";
import { createSwBranch } from "../helpers/neon.ts";
import { upsertEntry } from "../helpers/registry.ts";
import { fatal, log } from "../helpers/shell.ts";
import { serverTmuxScript } from "../helpers/tmux.ts";
import type { Target, WorktreeContext } from "../types.ts";

const shQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Remote target: push the branch, issue a Neon branch from the Mac, create an
 * exe.dev VM, provision native services on it (no Docker), drop the marker so all
 * future panes auto-ssh, then hand this pane to the box's dev server.
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

	// Ship the provisioner, the vendored herdr status hook, and the dev secrets.
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

	writeMarker(checkout, {
		target: "exe",
		host: vm.ssh_dest,
		path: remotePath,
		branch,
	});
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

	// Split the claude pane: the wrapper shell ssh's it into the box (marker is
	// written above), so `claude` runs on the devbox.
	const self = process.env.HERDR_PANE_ID;
	if (self) layoutPanes(self);

	// Hand THIS pane to the box's dev server in a status-less tmux session.
	const serverScript = serverTmuxScript({
		slug,
		dir: remotePath,
		runCmd: "bun dev",
	});
	execForeground("ssh", [
		"-t",
		"-o",
		"ServerAliveInterval=30",
		"-o",
		"ServerAliveCountMax=3",
		vm.ssh_dest,
		serverScript,
	]);
}
