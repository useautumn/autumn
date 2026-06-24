import {
	EXE_DEFAULTS,
	EXE_IMAGE,
	EXE_INTEGRATIONS,
	EXE_LOBBY,
} from "../constants.ts";
import { fatal, log, sh, shInherit } from "./shell.ts";

export type ExeVm = {
	name: string;
	ssh_dest: string;
	https_url?: string;
};

/** Control-plane call to the exe.dev lobby (`ssh exe.dev <command>`). */
function lobby(command: string): {
	stdout: string;
	stderr: string;
	code: number;
} {
	return sh("ssh", [EXE_LOBBY, command]);
}

/** Create a VM and return its ssh destination. Names are unique per account. */
export function createVm(name: string): ExeVm {
	log(
		`creating exe.dev VM ${name} (${EXE_DEFAULTS.cpu}cpu/${EXE_DEFAULTS.memory})`,
	);
	const flags = [
		`new --name=${name}`,
		`--cpu=${EXE_DEFAULTS.cpu}`,
		`--memory=${EXE_DEFAULTS.memory}`,
		`--disk=${EXE_DEFAULTS.disk}`,
		"--tag=autumn-sw",
		`--integration=${EXE_INTEGRATIONS.autumn}`,
		`--integration=${EXE_INTEGRATIONS.ai}`,
	];
	if (EXE_IMAGE) flags.push(`--image=${EXE_IMAGE}`);
	flags.push("--json");
	const res = lobby(flags.join(" "));
	if (res.code !== 0) {
		fatal(`exe.dev new failed: ${res.stderr || res.stdout}`);
	}
	try {
		const vm = JSON.parse(res.stdout) as ExeVm;
		if (!vm.ssh_dest) fatal(`exe.dev new returned no ssh_dest:\n${res.stdout}`);
		return vm;
	} catch {
		fatal(`could not parse exe.dev new output:\n${res.stdout}`);
	}
}

export function listVms(): ExeVm[] {
	const res = lobby("ls --json");
	if (res.code !== 0) return [];
	try {
		const parsed = JSON.parse(res.stdout) as { vms?: ExeVm[] };
		return parsed.vms ?? [];
	} catch {
		return [];
	}
}

export function removeVm(name: string): void {
	const res = lobby(`rm ${name}`);
	if (res.code !== 0) {
		console.error(
			`[sw] exe.dev rm ${name} failed: ${res.stderr || res.stdout}`,
		);
	} else {
		log(`removed exe.dev VM ${name}`);
	}
}

/** Run a command on the VM, streaming output. */
export function vmExec(sshDest: string, command: string): number {
	return shInherit("ssh", [sshDest, command]);
}

export function vmCapture(sshDest: string, command: string): string {
	const res = sh("ssh", [sshDest, command]);
	if (res.code !== 0) {
		fatal(`ssh ${sshDest} '${command}' failed: ${res.stderr || res.stdout}`);
	}
	return res.stdout;
}

/** Copy a local file to the VM via scp. */
export function scpTo(
	sshDest: string,
	localFile: string,
	remoteFile: string,
): void {
	const code = shInherit("scp", [localFile, `${sshDest}:${remoteFile}`]);
	if (code !== 0) fatal(`scp ${localFile} -> ${sshDest}:${remoteFile} failed`);
}
