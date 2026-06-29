import {
	NEON_PARENT_BRANCH,
	NEON_PROJECT_ID,
} from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import { ensureTemplateBranch, runNeon } from "./neon.ts";
import {
	type NeonProjectContext,
	withNeonContextSync,
} from "./neonContext.ts";
import { fatal, log } from "./shell.ts";

const PROJECT_NAME_PREFIX = "autumn-dw";

const NEON_REGION_IDS = new Set([
	"aws-us-west-2",
	"aws-ap-southeast-1",
	"aws-ap-southeast-2",
	"aws-eu-central-1",
	"aws-us-east-2",
	"aws-us-east-1",
	"azure-eastus2",
]);

const REGION_ALIASES: Record<string, string> = {
	"us-west-1": "aws-us-west-2",
	"us-west-2": "aws-us-west-2",
	"us-east-1": "aws-us-east-1",
	"us-east-2": "aws-us-east-2",
	"eu-central-1": "aws-eu-central-1",
	"ap-southeast-1": "aws-ap-southeast-1",
	"ap-southeast-2": "aws-ap-southeast-2",
};

export type ResolvedNeonProject = NeonProjectContext & {
	regionId: string | null;
};

type DefaultProjectMeta = { regionId: string; orgId: string };
let defaultProjectMeta: DefaultProjectMeta | undefined;

export function parseRegionArg(argv: string[]): string | undefined {
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith("--region=")) return arg.slice("--region=".length);
		if (arg === "--region" && argv[i + 1]) return argv[i + 1];
	}
	return undefined;
}

export function normalizeNeonRegion(input: string): string {
	const trimmed = input.trim();
	if (NEON_REGION_IDS.has(trimmed)) return trimmed;
	const alias = REGION_ALIASES[trimmed];
	if (alias) {
		if (trimmed === "us-west-1") {
			log("note: Neon has no us-west-1; using aws-us-west-2");
		}
		return alias;
	}
	const withPrefix = trimmed.startsWith("aws-") ? trimmed : `aws-${trimmed}`;
	if (NEON_REGION_IDS.has(withPrefix)) return withPrefix;
	fatal(
		`unknown Neon region "${input}". Supported: ${[...NEON_REGION_IDS].join(", ")}`,
	);
}

function defaultNeonProject(): ResolvedNeonProject {
	return {
		projectId: NEON_PROJECT_ID,
		regionId: null,
		templateParent: NEON_PARENT_BRANCH,
	};
}

function getDefaultProjectMeta(): DefaultProjectMeta {
	if (defaultProjectMeta) return defaultProjectMeta;
	const res = runNeon(["projects", "get", NEON_PROJECT_ID, "--output", "json"]);
	if (res.code !== 0) {
		fatal(`neon projects get failed: ${res.stderr || res.stdout}`);
	}
	try {
		const parsed = JSON.parse(res.stdout) as {
			region_id?: string;
			org_id?: string;
		};
		if (!parsed.region_id || !parsed.org_id) {
			fatal(
				`could not read region_id/org_id from default Neon project:\n${res.stdout}`,
			);
		}
		defaultProjectMeta = {
			regionId: parsed.region_id,
			orgId: parsed.org_id,
		};
		return defaultProjectMeta;
	} catch {
		fatal(`could not parse neon projects get output:\n${res.stdout}`);
	}
}

function neonOrgId(): string {
	return process.env.NEON_ORG_ID ?? getDefaultProjectMeta().orgId;
}

type NeonProjectSummary = { id: string; name: string; region_id?: string };

function listProjects(): NeonProjectSummary[] {
	const res = runNeon([
		"projects",
		"list",
		"--org-id",
		neonOrgId(),
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon projects list failed: ${res.stderr || res.stdout}`);
	}
	try {
		const parsed = JSON.parse(res.stdout) as
			| NeonProjectSummary[]
			| { projects?: NeonProjectSummary[] };
		if (Array.isArray(parsed)) return parsed;
		return parsed.projects ?? [];
	} catch {
		fatal(`could not parse neon projects list output:\n${res.stdout}`);
	}
}

function findProjectByName(name: string): NeonProjectSummary | undefined {
	return listProjects().find((p) => p.name === name);
}

function createProject({
	name,
	regionId,
}: {
	name: string;
	regionId: string;
}): NeonProjectSummary {
	log(`creating Neon project ${name} in ${regionId}`);
	const res = runNeon([
		"projects",
		"create",
		"--name",
		name,
		"--region-id",
		regionId,
		"--org-id",
		neonOrgId(),
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon projects create failed: ${res.stderr || res.stdout}`);
	}
	try {
		const parsed = JSON.parse(res.stdout) as
			| NeonProjectSummary
			| { project?: NeonProjectSummary };
		const project =
			"project" in parsed && parsed.project
				? parsed.project
				: (parsed as NeonProjectSummary);
		if (!project?.id) {
			fatal(`unexpected neon projects create output:\n${res.stdout}`);
		}
		return project;
	} catch {
		fatal(`could not parse neon projects create output:\n${res.stdout}`);
	}
}

function getDefaultBranchName(projectId: string): string {
	const res = runNeon([
		"branches",
		"list",
		"--project-id",
		projectId,
		"--output",
		"json",
	]);
	if (res.code !== 0) {
		fatal(`neon branches list failed: ${res.stderr || res.stdout}`);
	}
	try {
		const branches = JSON.parse(res.stdout) as {
			name: string;
			default?: boolean;
			primary?: boolean;
		}[];
		const branch =
			branches.find((b) => b.default) ??
			branches.find((b) => b.primary) ??
			branches[0];
		if (!branch?.name) {
			fatal(`no default branch in Neon project ${projectId}`);
		}
		return branch.name;
	} catch {
		fatal(`could not parse neon branches list output:\n${res.stdout}`);
	}
}

function upsertRegionalNeonProject(regionId: string): ResolvedNeonProject {
	if (regionId === getDefaultProjectMeta().regionId) {
		return defaultNeonProject();
	}

	const name = `${PROJECT_NAME_PREFIX}-${regionId}`;
	let project = findProjectByName(name);
	if (!project) {
		project = createProject({ name, regionId });
	} else {
		log(`using Neon project ${name} (${project.id})`);
	}

	const templateParent = getDefaultBranchName(project.id);
	const ctx: NeonProjectContext = {
		projectId: project.id,
		templateParent,
	};
	withNeonContextSync(ctx, () => ensureTemplateBranch());

	return { ...ctx, regionId };
}

export function resolveNeonRegionForSetup({
	regionArg,
	entry,
}: {
	regionArg?: string;
	entry?: RegistryEntry;
}): ResolvedNeonProject {
	const requestedRaw = regionArg ?? entry?.neonRegion;
	if (!requestedRaw) return defaultNeonProject();

	const regionId = normalizeNeonRegion(requestedRaw);
	if (
		entry?.neonRegion &&
		regionArg &&
		normalizeNeonRegion(regionArg) !== entry.neonRegion
	) {
		fatal(
			`worktree provisioned in ${entry.neonRegion}; teardown before using --region=${regionArg}`,
		);
	}

	if (entry?.neonProjectId && entry.neonProjectId !== NEON_PROJECT_ID) {
		return {
			projectId: entry.neonProjectId,
			regionId: entry.neonRegion ?? regionId,
			templateParent: getDefaultBranchName(entry.neonProjectId),
		};
	}

	return upsertRegionalNeonProject(regionId);
}
