import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);
const pkgPath = path.join(rootDir, "packages/mcp/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const sharedPath = path.join(rootDir, "packages/mcp/src/mcp-server/shared.ts");
const toolsPath = path.join(rootDir, "packages/mcp/src/mcp-server/tools.ts");
const oauthPath = path.join(rootDir, "packages/mcp/src/mcp-server/oauth.ts");
const resourcesPath = path.join(
	rootDir,
	"packages/mcp/src/mcp-server/autumn-resources.ts",
);
const oauthTemplatePath = path.join(
	rootDir,
	"packages/openapi/mcp/oauth.template",
);
const resourcesTemplatePath = path.join(
	rootDir,
	"packages/openapi/mcp/resources.template",
);
const serverPath = path.join(rootDir, "packages/mcp/src/mcp-server/server.ts");
const serveCommandPath = path.join(
	rootDir,
	"packages/mcp/src/mcp-server/cli/serve/command.ts",
);
const serveImplPath = path.join(
	rootDir,
	"packages/mcp/src/mcp-server/cli/serve/impl.ts",
);

const replaceGenerated = (
	input: string,
	search: string,
	replacement: string,
) => {
	if (input.includes(replacement)) return input;
	if (!input.includes(search)) {
		throw new Error(
			`Generated MCP file did not contain expected text:\n${search}`,
		);
	}
	return input.replace(search, replacement);
};

const patchGeneratedFile = (
	filePath: string,
	patches: Array<{ search: string; replacement: string }>,
) => {
	let input = readFileSync(filePath, "utf8");
	for (const patch of patches) {
		input = replaceGenerated(input, patch.search, patch.replacement);
	}
	writeFileSync(filePath, input);
};

pkg.scripts = {
	generate: "speakeasy run -t autumn-mcp -y -o console",
	build: "bun src/mcp-server/build.mts && tsc",
	"mcpb:build": "bun src/mcp-server/build.mts --pack && tsc",
	start: "node bin/mcp-server.js start",
	ts: "tsc --noEmit",
};
pkg.dependencies = {
	...pkg.dependencies,
	"@autumn/shared": "workspace:*",
};

for (const dep of [
	"@eslint/js",
	"bun",
	"eslint",
	"globals",
	"typescript-eslint",
]) {
	delete pkg.devDependencies?.[dep];
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
copyFileSync(oauthTemplatePath, oauthPath);
copyFileSync(resourcesTemplatePath, resourcesPath);
writeFileSync(
	sharedPath,
	replaceGenerated(
		readFileSync(sharedPath, "utf8"),
		"new Blob(chunks).arrayBuffer()",
		"new Blob(chunks as BlobPart[]).arrayBuffer()",
	),
);
writeFileSync(
	toolsPath,
	replaceGenerated(
		readFileSync(toolsPath, "utf8"),
		"return disableStaticAuth ? undefined : schema.parse(cliFlagValue);",
		[
			"if (disableStaticAuth) return undefined;",
			"  return cliFlagValue === undefined ? schema.parse(undefined) : cliFlagValue;",
		].join("\n"),
	),
);

let serveCommand = readFileSync(serveCommandPath, "utf8");
if (!serveCommand.includes('"oauth-enabled"')) {
	serveCommand = replaceGenerated(
		serveCommand,
		`      "disable-static-auth": {
        kind: "boolean",
        brief:
          "Disable static authentication, allowing credentials to be passed via request headers only",
        default: false,
      },
`,
		`      "disable-static-auth": {
        kind: "boolean",
        brief:
          "Disable static authentication, allowing credentials to be passed via request headers only",
        default: false,
      },
      "oauth-enabled": {
        kind: "boolean",
        brief: "Require OAuth bearer auth for Streamable HTTP requests",
        default: false,
      },
      "oauth-issuer-url": {
        kind: "parsed",
        brief: "Autumn OAuth issuer URL",
        optional: true,
        parse: (value) => new URL(value).toString().replace(/\\/$/, ""),
      },
      "oauth-resource-url": {
        kind: "parsed",
        brief: "Canonical MCP resource URL",
        optional: true,
        parse: (value) => new URL(value).toString().replace(/\\/$/, ""),
      },
      "oauth-api-key-url": {
        kind: "parsed",
        brief: "Autumn OAuth API key exchange URL",
        optional: true,
        parse: (value) => new URL(value).toString(),
      },
      "oauth-environment": {
        kind: "enum",
        brief: "Autumn environment used for OAuth-backed tool calls",
        default: "sandbox",
        values: ["sandbox", "live"],
      },
`,
	);
	writeFileSync(serveCommandPath, serveCommand);
}

let serveImpl = readFileSync(serveImplPath, "utf8");
serveImpl = replaceGenerated(
	serveImpl,
	`import { buildSDK } from "../../tools.js";`,
	`import {
  buildSDKForRequest,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  OAuthEnvironment,
  OAuthHttpError,
} from "../../oauth.js";`,
);
serveImpl = replaceGenerated(
	serveImpl,
	`interface ServeCommandFlags extends MCPServerFlags {
  readonly port: number;
  readonly "disable-static-auth": boolean;
  readonly "log-level": ConsoleLoggerLevel;
  readonly env?: [string, string][];
}`,
	`interface ServeCommandFlags extends MCPServerFlags {
  readonly port: number;
  readonly "disable-static-auth": boolean;
  readonly "oauth-enabled": boolean;
  readonly "oauth-issuer-url"?: string | undefined;
  readonly "oauth-resource-url"?: string | undefined;
  readonly "oauth-api-key-url"?: string | undefined;
  readonly "oauth-environment": OAuthEnvironment;
  readonly "log-level": ConsoleLoggerLevel;
  readonly env?: [string, string][];
}`,
);
serveImpl = replaceGenerated(
	serveImpl,
	`  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const transport = new StreamableHTTPServerTransport({});
`,
	`  app.use(express.json());

  const getHeaders = (req: express.Request) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }
    return headers;
  };

  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    res.json(getProtectedResourceMetadata(getHeaders(req), cliFlags));
  });

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json(getAuthorizationServerMetadata(cliFlags));
  });

  app.post("/mcp", async (req, res) => {
    const headers = getHeaders(req);
    let sdk;
    try {
      sdk = await buildSDKForRequest(headers, cliFlags, logger);
    } catch (error) {
      if (error instanceof OAuthHttpError) {
        if (error.wwwAuthenticate) {
          res.header("WWW-Authenticate", error.wwwAuthenticate);
        }
        res.status(error.status).json({
          error: error.error,
          error_description: error.message,
        });
        return;
      }
      throw error;
    }

    const transport = new StreamableHTTPServerTransport({});
`,
);
serveImpl = replaceGenerated(
	serveImpl,
	`      getSDK: () =>
        buildSDK(headers, cliFlags, cliFlags["disable-static-auth"], logger),`,
	`      getSDK: () => sdk,`,
);
writeFileSync(serveImplPath, serveImpl);

patchGeneratedFile(serverPath, [
	{
		search: `import { SDKOptions } from "../lib/config.js";`,
		replacement: [
			`import { SDKOptions } from "../lib/config.js";`,
			`import { registerAutumnResources } from "./autumn-resources.js";`,
		].join("\n"),
	},
	{
		search: [
			`  const register = { tool, resource, resourceTemplate, prompt };`,
			`  void register; // suppress unused warnings`,
			``,
			`  tool(tool$customersGet);`,
		].join("\n"),
		replacement: [
			`  const register = { tool, resource, resourceTemplate, prompt };`,
			`  registerAutumnResources(register);`,
			``,
			`  tool(tool$customersGet);`,
		].join("\n"),
	},
]);

rmSync(path.join(rootDir, "packages/mcp/eslint.config.mjs"), { force: true });
rmSync(path.join(rootDir, "packages/mcp/.eslintcache"), { force: true });
