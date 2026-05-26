import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { resolvePaths } from "../utils/paths.js";

const MCP_OPERATION_IDS = [
	"listCustomers",
	"getCustomer",
	"listPlans",
	"getPlan",
	"previewAttach",
	"attach",
	"previewUpdate",
	"billingUpdate",
] as const;

const runSpeakeasy = (args: string[]) => {
	const bin = process.env.SPEAKEASY_BIN ?? "speakeasy";
	const result = spawnSync(bin, args, {
		stdio: "inherit",
		shell: true,
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(`${bin} ${args.join(" ")} failed`);
	}
};

const paths = resolvePaths();
const overlayPath = path.join(paths.openApiDir, "mcp-overlay.yaml");
const tmpInputPath = path.join(paths.openApiDir, "openapi-mcp.input.yml");
const tmpFilteredPath = path.join(paths.openApiDir, "openapi-mcp.filtered.yml");
const mcpOutputPath = paths.openApiMcpOutput;

if (!existsSync(paths.openApiStrippedOutput)) {
	throw new Error(
		`${paths.openApiStrippedOutput} does not exist. Run \`bun api\` first.`,
	);
}

mkdirSync(path.dirname(mcpOutputPath), { recursive: true });

const strippedSpec = JSON.parse(
	JSON.stringify(yaml.parse(readFileSync(paths.openApiStrippedOutput, "utf8"))),
);
writeFileSync(
	tmpInputPath,
	yaml.stringify(strippedSpec, { aliasDuplicateObjects: false }),
);

try {
	runSpeakeasy([
		"openapi",
		"transform",
		"filter-operations",
		"--schema",
		tmpInputPath,
		"--operations",
		MCP_OPERATION_IDS.join(","),
		"--out",
		tmpFilteredPath,
	]);

	const filteredSpec = yaml.parse(readFileSync(tmpFilteredPath, "utf8")) as {
		webhooks?: unknown;
	};
	delete filteredSpec.webhooks;
	writeFileSync(
		tmpFilteredPath,
		yaml.stringify(filteredSpec, { aliasDuplicateObjects: false }),
	);

	runSpeakeasy([
		"overlay",
		"apply",
		"--strict",
		"--schema",
		tmpFilteredPath,
		"--overlay",
		overlayPath,
		"--out",
		mcpOutputPath,
	]);
} finally {
	for (const tmpPath of [tmpInputPath, tmpFilteredPath]) {
		if (existsSync(tmpPath)) {
			unlinkSync(tmpPath);
		}
	}
}

console.log(`Generated ${mcpOutputPath}`);
