const DEFAULT_NAME = "autumn-dev";
const DEFAULT_URL = "http://localhost:3099/mcp";

type Client = {
	label: string;
	bin: string;
	removeArgs: (name: string) => string[];
	addArgs: (name: string, url: string) => string[];
	next: (name: string) => string;
};

const clients: Client[] = [
	{
		label: "Claude Code",
		bin: "claude",
		removeArgs: (name) => ["mcp", "remove", name],
		addArgs: (name, url) => ["mcp", "add", "--transport", "http", name, url],
		next: () => "Claude prompts for OAuth automatically on first use.",
	},
	{
		label: "Codex",
		bin: "codex",
		removeArgs: (name) => ["mcp", "remove", name],
		addArgs: (name, url) => ["mcp", "add", name, "--url", url],
		next: (name) =>
			`Run \`codex mcp login ${name}\` to authenticate (OAuth). If the handshake fails, retry with \`-c experimental_use_rmcp_client=true\`.`,
	},
];

const run = (bin: string, args: string[]) => {
	const proc = Bun.spawnSync([bin, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = `${proc.stdout.toString()}${proc.stderr.toString()}`.trim();
	return { ok: proc.exitCode === 0, output };
};

const addToClient = (client: Client, name: string, url: string) => {
	if (!Bun.which(client.bin)) {
		console.log(`- ${client.label}: skipped (\`${client.bin}\` not found)`);
		return;
	}

	run(client.bin, client.removeArgs(name));

	const { ok, output } = run(client.bin, client.addArgs(name, url));
	if (ok) {
		console.log(`+ ${client.label}: added \`${name}\` -> ${url}`);
		console.log(`    next: ${client.next(name)}`);
		return;
	}

	console.log(`! ${client.label}: failed to add \`${name}\``);
	if (output) console.log(`    ${output.replaceAll("\n", "\n    ")}`);
};

const main = () => {
	const [, , nameArg, urlArg] = process.argv;
	if (nameArg === "--help" || nameArg === "-h") {
		console.log("Usage: bun add-mcp [name] [url]");
		console.log(`Defaults: ${DEFAULT_NAME} ${DEFAULT_URL}`);
		return;
	}

	const name = nameArg ?? DEFAULT_NAME;
	const url = urlArg ?? DEFAULT_URL;

	console.log(`Registering MCP server \`${name}\` (${url})\n`);
	for (const client of clients) {
		addToClient(client, name, url);
	}
};

main();
