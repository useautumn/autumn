# Autumn MCP

Generated operational MCP server for selected Autumn API routes.

Regenerate the spec and server from the repo root:

```sh
bun run mcp:spec
bun run mcp:generate
```

The generated server uses Autumn bearer API keys. Existing Autumn API route
checks remain authoritative for scopes (`customers:read`, `plans:read`,
`billing:read`, `billing:write`). These required scopes are also recorded on
the MCP OpenAPI operations as `x-autumn-scopes`.

Speakeasy's native MCP `scopes` field is not used here because it rejects
colon-delimited scope names; using `x-autumn-scopes` keeps the metadata aligned
with Autumn API keys without introducing a second scope vocabulary.

<!-- Start Summary [summary] -->
## Summary


<!-- End Summary [summary] -->

<!-- Start Table of Contents [toc] -->
## Table of Contents
<!-- $toc-max-depth=2 -->
* [Autumn MCP](#autumn-mcp)
  * [Installation](#installation)
  * [Progressive Discovery](#progressive-discovery)

<!-- End Table of Contents [toc] -->

<!-- Start Installation [installation] -->
## Installation

> [!TIP]
> To finish publishing your MCP Server to npm and others you must [run your first generation action](https://www.speakeasy.com/docs/github-setup#step-by-step-guide).
<details>
<summary>Claude Desktop</summary>

Install the MCP server as a Desktop Extension using the pre-built [`mcp-server.mcpb`](./mcp-server.mcpb) file:

Simply drag and drop the [`mcp-server.mcpb`](./mcp-server.mcpb) file onto Claude Desktop to install the extension.

The MCP bundle package includes the MCP server and all necessary configuration. Once installed, the server will be available without additional setup.

> [!NOTE]
> MCP bundles provide a streamlined way to package and distribute MCP servers. Learn more about [Desktop Extensions](https://www.anthropic.com/engineering/desktop-extensions).

</details>

<details>
<summary>Cursor</summary>

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=AutumnMcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAYXV0dW1uL21jcCIsInN0YXJ0IiwiLS1zZWNyZXQta2V5IiwiIiwiLS14LWFwaS12ZXJzaW9uIiwiMi4zLjAiLCItLWZhaWwtb3BlbiIsdHJ1ZV19)

Or manually:

1. Open Cursor Settings
2. Select Tools and Integrations
3. Select New MCP Server
4. If the configuration file is empty paste the following JSON into the MCP Server Configuration:

```json
{
  "command": "npx",
  "args": [
    "@autumn/mcp",
    "start",
    "--secret-key",
    "",
    "--x-api-version",
    "2.3.0",
    "--fail-open",
    true
  ]
}
```

</details>

<details>
<summary>Claude Code CLI</summary>

```bash
claude mcp add AutumnMcp -- npx -y @autumn/mcp start --secret-key  --x-api-version 2.3.0 --fail-open true
```

</details>
<details>
<summary>Gemini</summary>

```bash
gemini mcp add AutumnMcp -- npx -y @autumn/mcp start --secret-key  --x-api-version 2.3.0 --fail-open true
```

</details>
<details>
<summary>Windsurf</summary>

Refer to [Official Windsurf documentation](https://docs.windsurf.com/windsurf/cascade/mcp#adding-a-new-mcp-plugin) for latest information

1. Open Windsurf Settings
2. Select Cascade on left side menu
3. Click on `Manage MCPs`. (To Manage MCPs you should be signed in with a Windsurf Account)
4. Click on `View raw config` to open up the mcp configuration file.
5. If the configuration file is empty paste the full json

```bash
{
  "command": "npx",
  "args": [
    "@autumn/mcp",
    "start",
    "--secret-key",
    "",
    "--x-api-version",
    "2.3.0",
    "--fail-open",
    true
  ]
}
```
</details>
<details>
<summary>VS Code</summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20AutumnMcp%20MCP&color=0098FF)](vscode://ms-vscode.vscode-mcp/install?name=AutumnMcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAYXV0dW1uL21jcCIsInN0YXJ0IiwiLS1zZWNyZXQta2V5IiwiIiwiLS14LWFwaS12ZXJzaW9uIiwiMi4zLjAiLCItLWZhaWwtb3BlbiIsdHJ1ZV19)

Or manually:

Refer to [Official VS Code documentation](https://code.visualstudio.com/api/extension-guides/ai/mcp) for latest information

1. Open [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette)
1. Search and open `MCP: Open User Configuration`. This should open mcp.json file
2. If the configuration file is empty paste the full json

```bash
{
  "command": "npx",
  "args": [
    "@autumn/mcp",
    "start",
    "--secret-key",
    "",
    "--x-api-version",
    "2.3.0",
    "--fail-open",
    true
  ]
}
```

</details>
<details>
<summary> Stdio installation via npm </summary>
To start the MCP server, run:

```bash
npx @autumn/mcp start --secret-key  --x-api-version 2.3.0 --fail-open true
```

For a full list of server arguments, run:

```
npx @autumn/mcp --help
```

</details>
<!-- End Installation [installation] -->

<!-- Start Progressive Discovery [dynamic-mode] -->
## Progressive Discovery

MCP servers with many tools can bloat LLM context windows, leading to increased token usage and tool confusion. Dynamic mode solves this by exposing only a small set of meta-tools that let agents progressively discover and invoke tools on demand.

To enable dynamic mode, pass the `--mode dynamic` flag when starting your server:

```jsonc
{
  "mcpServers": {
    "AutumnMcp": {
      "command": "npx",
      "args": ["@autumn/mcp", "start", "--mode", "dynamic"],
      // ... other server arguments
    }
  }
}
```

In dynamic mode, the server registers only the following meta-tools instead of every individual tool:

- **`list_tools`**: Lists all available tools with their names and descriptions.
- **`describe_tool_input`**: Returns the input schema for one or more tools by name.
- **`execute_tool`**: Executes a tool by name with its arguments.

This approach significantly reduces the number of tokens sent to the LLM on each request, which is especially useful for servers with a large number of tools.
<!-- End Progressive Discovery [dynamic-mode] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->
