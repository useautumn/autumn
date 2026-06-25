import { existsSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	EXE_INTEGRATIONS,
	PROVISION_SH,
	REMOTE_WORKTREES_SUBDIR,
	SCRIPT_DIR,
} from "../constants.ts";
import { installClaudeCredential } from "../helpers/claude.ts";
import {
	createVm,
	scpTo,
	vmCapture,
	vmExec,
	vmWaitReady,
} from "../helpers/exe.ts";
import { execForeground } from "../helpers/exec.ts";
import { originUrl, pushBranchToBox, toHttpsOrigin } from "../helpers/git.ts";
import { exportDevDotenv } from "../helpers/infisical.ts";
import { layoutPanes } from "../helpers/layout.ts";
import { writeMarker } from "../helpers/marker.ts";
import { createSwBranch } from "../helpers/neon.ts";
import { ensureOpenListener } from "../helpers/open-listener.ts";
import { upsertEntry } from "../helpers/registry.ts";
import { fatal, log } from "../helpers/shell.ts";
import { ensureSshKeyLoaded, sshExecArgs } from "../helpers/ssh.ts";
import { serverTmuxScript } from "../helpers/tmux.ts";
import type { Target, WorktreeContext } from "../types.ts";

const shQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Remote target: issue a Neon branch from the Mac, create an exe.dev VM, provision
 * native services + clone the base, then push the worktree branch STRAIGHT to the
 * box (never origin) and finish setup. Finally drive the panes via explicit ssh.
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

	// Load the key into the agent up front → one passphrase prompt for the whole
	// run AND for any pane opened later (the wrapper reuses the agent).
	ensureSshKeyLoaded();
	// Mac-side listener so the box's xdg-open shim can pop links in your browser.
	ensureOpenListener();

	const neon = createSwBranch(slug);
	// Unique per run: reusing a name reuses the hostname → host-key mismatch against
	// the recreated box. Registry stores the real name for teardown.
	const vmName = `sw-${slug}-${crypto.randomUUID().slice(0, 7)}`.slice(0, 60);
	const vm = createVm(vmName);
	vmWaitReady(vm.ssh_dest);

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
	// Ship your local zshrc + p10k config so the box shell feels like home.
	const localZshrc = join(homedir(), ".zshrc");
	if (existsSync(localZshrc)) scpTo(vm.ssh_dest, localZshrc, "/tmp/sw-zshrc");
	const localP10k = join(homedir(), ".p10k.zsh");
	if (existsSync(localP10k)) scpTo(vm.ssh_dest, localP10k, "/tmp/sw-p10k.zsh");

	const httpsOrigin = toHttpsOrigin(originUrl(checkout));

	// Phase 1: services + clone the base branch on the box (via integrations).
	log(`provisioning ${vm.ssh_dest} (native services, no docker)`);
	const cloneArgs = [
		remotePath,
		httpsOrigin,
		EXE_INTEGRATIONS.autumn,
		EXE_INTEGRATIONS.ai,
	]
		.map(shQuote)
		.join(" ");
	if (vmExec(vm.ssh_dest, `bash ${provisionRemote} clone ${cloneArgs}`) !== 0) {
		fatal("remote clone phase failed");
	}

	// Push the worktree branch straight to the box's clone — NEVER to origin.
	pushBranchToBox({ checkout, sshDest: vm.ssh_dest, remotePath, branch });

	// Phase 2: checkout + submodules + deps + env + claude.
	const setupArgs = [
		remotePath,
		branch,
		slug,
		neon.databaseUrl,
		hookRemote,
		baseEnvRemote,
		checkout, // Mac local checkout — for the `swdown` self-teardown helper
	]
		.map(shQuote)
		.join(" ");
	if (vmExec(vm.ssh_dest, `bash ${provisionRemote} setup ${setupArgs}`) !== 0) {
		fatal("remote setup phase failed");
	}

	// Copy your claude login (Keychain → box) so claude is signed in on the box.
	installClaudeCredential(vm.ssh_dest);

	// Drop the marker BEFORE laying out panes, so the wrapper auto-ssh's the claude
	// split (and any pane you open later) into the box.
	writeMarker(checkout, { host: vm.ssh_dest, path: remotePath });

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

	// The claude pane is spawned by the wrapper (marker present → already on the
	// box), so it just runs `claude`. This (server) pane hosts `bun dev` in tmux.
	const self = process.env.HERDR_PANE_ID;
	if (self) layoutPanes(self, "claude");

	const serverScript = serverTmuxScript({
		slug,
		dir: remotePath,
		runCmd: "bun dev",
	});
	execForeground("ssh", sshExecArgs(vm.ssh_dest, serverScript));
}
