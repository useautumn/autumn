import { execFileSync } from "node:child_process";
import {
	diffOpenApiOperations,
	type OpenApiOperation,
	type OperationDiff,
} from "./diffOpenApiOperations";

export const RELEASE_IMPACT_VERSION = 1;

export type ReleaseTarget = "autumn-js" | "atmn" | "docs" | "gateway";

type TargetRule = {
	paths: string[];
	publicOperations: boolean;
	internalOperations: boolean;
};

const TARGET_RULES: Record<ReleaseTarget, TargetRule> = {
	"autumn-js": {
		paths: ["packages/autumn-js/", "packages/sdk/"],
		publicOperations: true,
		internalOperations: false,
	},
	atmn: {
		paths: [
			"packages/atmn/",
			"packages/atmn-generator/",
			"packages/agent-docs/",
		],
		publicOperations: true,
		internalOperations: true,
	},
	docs: {
		paths: ["apps/docs/mintlify/"],
		publicOperations: true,
		internalOperations: false,
	},
	gateway: {
		paths: ["packages/gateway/"],
		publicOperations: false,
		internalOperations: false,
	},
};

type ImpactOperation = OpenApiOperation & { docsPage: string | null };

type ImpactDiff = {
	added: ImpactOperation[];
	removed: ImpactOperation[];
	changed: ImpactOperation[];
};

export type ReleaseImpact = {
	version: typeof RELEASE_IMPACT_VERSION;
	baseSha: string;
	headSha: string;
	operations: { public: ImpactDiff; internal: ImpactDiff };
	targets: Record<
		ReleaseTarget,
		{ affected: boolean; touchedFiles: string[]; reasons: string[] }
	>;
};

const withDocsPage = ({ diff }: { diff: OperationDiff }): ImpactDiff => {
	const toImpact = (op: OpenApiOperation): ImpactOperation => ({
		...op,
		docsPage: op.operationId
			? `api-reference/${op.tag}/${op.operationId}`
			: null,
	});
	return {
		added: diff.added.map(toImpact),
		removed: diff.removed.map(toImpact),
		changed: diff.changed.map(toImpact),
	};
};

const countOperations = ({ diff }: { diff: ImpactDiff }) =>
	diff.added.length + diff.removed.length + diff.changed.length;

const describeDiff = ({ label, diff }: { label: string; diff: ImpactDiff }) =>
	`${label} API: ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed`;

export const buildReleaseImpact = ({
	baseSha,
	headSha,
	changedFiles,
	publicDiff,
	internalDiff,
}: {
	baseSha: string;
	headSha: string;
	changedFiles: string[];
	publicDiff: OperationDiff;
	internalDiff: OperationDiff;
}): ReleaseImpact => {
	const operations = {
		public: withDocsPage({ diff: publicDiff }),
		internal: withDocsPage({ diff: internalDiff }),
	};
	const publicChanged = countOperations({ diff: operations.public }) > 0;
	const internalChanged = countOperations({ diff: operations.internal }) > 0;

	const targets = Object.fromEntries(
		Object.entries(TARGET_RULES).map(([target, rule]) => {
			const touchedFiles = changedFiles.filter((file) =>
				rule.paths.some((prefix) => file.startsWith(prefix)),
			);
			const reasons = [
				...(touchedFiles.length > 0
					? [
							`touches ${touchedFiles.length} file(s) in ${rule.paths.join(", ")}`,
						]
					: []),
				...(rule.publicOperations && publicChanged
					? [describeDiff({ label: "public", diff: operations.public })]
					: []),
				...(rule.internalOperations && internalChanged
					? [describeDiff({ label: "internal", diff: operations.internal })]
					: []),
			];
			return [target, { affected: reasons.length > 0, touchedFiles, reasons }];
		}),
	) as ReleaseImpact["targets"];

	return {
		version: RELEASE_IMPACT_VERSION,
		baseSha,
		headSha,
		operations,
		targets,
	};
};

const readSpec = async ({ dir, name }: { dir: string; name: string }) =>
	Bun.YAML.parse(await Bun.file(`${dir}/${name}`).text()) as Parameters<
		typeof diffOpenApiOperations
	>[0]["base"];

const readArg = ({ name }: { name: string }) => {
	const index = process.argv.indexOf(`--${name}`);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) throw new Error(`Missing --${name}`);
	return value;
};

const main = async () => {
	const baseSha = readArg({ name: "base-sha" });
	const headSha = readArg({ name: "head-sha" });
	const baseDir = readArg({ name: "base-dir" });
	const headDir = readArg({ name: "head-dir" });

	const changedFiles = execFileSync(
		"git",
		["diff", "--name-only", baseSha, headSha],
		{ encoding: "utf8" },
	)
		.split("\n")
		.filter(Boolean);

	const [basePublic, headPublic, baseInternal, headInternal] =
		await Promise.all([
			readSpec({ dir: baseDir, name: "openapi.yml" }),
			readSpec({ dir: headDir, name: "openapi.yml" }),
			readSpec({ dir: baseDir, name: "openapi-internal.yml" }),
			readSpec({ dir: headDir, name: "openapi-internal.yml" }),
		]);

	const impact = buildReleaseImpact({
		baseSha,
		headSha,
		changedFiles,
		publicDiff: diffOpenApiOperations({ base: basePublic, head: headPublic }),
		internalDiff: diffOpenApiOperations({
			base: baseInternal,
			head: headInternal,
		}),
	});
	console.log(JSON.stringify(impact));
};

if (import.meta.main) await main();
