import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const usage = `Render a TSX subject against the real Autumn theme and screenshot it.

Usage: bun render/render.ts <subject.tsx> [options]   (run from vite/)

The subject module exports either a default React component, or a named
\`cases\` export (Array<{ name, node }> or Record<string, ReactNode>) for a
labeled contact sheet. Import app code the way the app does:
  import { Button } from "@autumn/ui/components/ui/button";
  import { X } from "@/components/...";

Options:
  --compare <b.tsx>   Render a second subject below the first (A/B labels)
  --theme <t>         light | dark | both (default: both)
  --preset <p>        classic | modern (default: classic)
  --surface <token>   Background variable to paint the stage: background | card | outer-background | popover (default: background)
  --width <px>        Fixed stage width (default: fit content)
  --pad <px>          Stage padding (default: 24)
  --inspect           Outline every element box and extend its edges full-span (alignment check)
  --guides            Center crosshair guides
  --scale <n>         Device scale factor (default: 2)
  --viewport <WxH>    Browser viewport (default: 1600x2000); 390x844 triggers mobile media queries
  --full-page         Screenshot the viewport instead of the stage (fixed overlays: sheets, dialogs, toasts)
  --touch             Emulate a touch device (pointer: coarse, hover: none)
  --name <name>       Output basename (default: subject file name)
  --out-dir <dir>     Output directory (default: vite/.render)`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		compare: { type: "string" },
		theme: { type: "string", default: "both" },
		preset: { type: "string", default: "classic" },
		surface: { type: "string", default: "background" },
		width: { type: "string" },
		pad: { type: "string", default: "24" },
		guides: { type: "boolean", default: false },
		inspect: { type: "boolean", default: false },
		scale: { type: "string", default: "2" },
		viewport: { type: "string", default: "1600x2000" },
		"full-page": { type: "boolean", default: false },
		touch: { type: "boolean", default: false },
		name: { type: "string" },
		"out-dir": { type: "string" },
		help: { type: "boolean", default: false },
	},
});

if (values.help || positionals.length === 0) {
	console.log(usage);
	process.exit(values.help ? 0 : 1);
}

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(toolDir, "harness");
const viteDir = path.resolve(toolDir, "..");
const repoRoot = path.resolve(viteDir, "..");
const uiDir = path.join(repoRoot, "packages/ui");

const subjectPath = path.resolve(positionals[0]);
const comparePath = values.compare ? path.resolve(values.compare) : undefined;
const themes = values.theme === "both" ? ["light", "dark"] : [values.theme];
if (!themes.every((theme) => theme === "light" || theme === "dark")) {
	throw new TypeError(`Invalid theme: ${values.theme}`);
}

const genLines = [
	`import * as A from ${JSON.stringify(subjectPath)};`,
	comparePath ? `import * as B from ${JSON.stringify(comparePath)};` : "",
	`
type Case = { name: string; node: React.ReactNode };

const normalize = (mod: Record<string, unknown>, label: string): Case[] => {
  const cases = mod.cases as Case[] | Record<string, React.ReactNode> | undefined;
  if (Array.isArray(cases)) return cases.map((entry) => ({ ...entry, name: label ? \`\${label} \${entry.name}\` : entry.name }));
  if (cases) return Object.entries(cases).map(([name, node]) => ({ name: label ? \`\${label} \${name}\` : name, node }));
  const Component = mod.default as React.ComponentType;
  return [{ name: label || "default", node: <Component /> }];
};

export const subjects: Case[] = [
  ...normalize(A, ${JSON.stringify(comparePath ? "A:" : "")}),
${comparePath ? `  ...normalize(B, "B:"),` : ""}
];
`,
].join("\n");

await writeFile(path.join(harnessDir, "subject.gen.tsx"), genLines);

const sourceDirs = new Set([harnessDir, path.dirname(subjectPath)]);
if (comparePath) sourceDirs.add(path.dirname(comparePath));
const stylesGen = [
	`@import ${JSON.stringify(path.join(uiDir, "src/styles/index.css"))};`,
	...[...sourceDirs].map((dir) => `@source ${JSON.stringify(dir)};`),
].join("\n");
await writeFile(path.join(harnessDir, "styles.gen.css"), stylesGen);

const { createServer } = await import("vite");
const react = (await import("@vitejs/plugin-react")).default;
const tailwindcss = (await import("@tailwindcss/vite")).default;

const server = await createServer({
	configFile: false,
	root: harnessDir,
	publicDir: path.join(viteDir, "public"),
	plugins: [react(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom", "recharts"],
		alias: [
			{ find: /^@autumn\/ui$/, replacement: path.join(uiDir, "src/index.ts") },
			{ find: /^@autumn\/ui\//, replacement: `${path.join(uiDir, "src")}/` },
			{ find: /^@\//, replacement: `${path.join(viteDir, "src")}/` },
			{
				find: /^autumn-js\/react$/,
				replacement: path.join(
					repoRoot,
					"packages/autumn-js/src/react/index.ts",
				),
			},
			{
				find: /^autumn-js$/,
				replacement: path.join(repoRoot, "packages/autumn-js/src/sdk/index.ts"),
			},
		],
	},
	optimizeDeps: {
		exclude: ["@autumn/ui", "@autumn/shared", "autumn-js", "autumn-js/react"],
	},
	define: {
		__APP_ENV__: JSON.stringify(""),
		__WORKTREE_NUM__: JSON.stringify("1"),
	},
	server: { fs: { allow: [repoRoot] } },
	logLevel: "error",
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) throw new Error("Vite dev server produced no local URL");

const viewportMatch = /^(\d+)x(\d+)$/.exec(values.viewport);
if (!viewportMatch) throw new TypeError(`Invalid viewport: ${values.viewport}`);

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
	viewport: {
		width: Number(viewportMatch[1]),
		height: Number(viewportMatch[2]),
	},
	deviceScaleFactor: Number(values.scale),
	hasTouch: values.touch,
	isMobile: values.touch,
});

const outDir = values["out-dir"]
	? path.resolve(values["out-dir"])
	: path.join(viteDir, ".render");
await mkdir(outDir, { recursive: true });
const baseName =
	values.name ?? path.basename(subjectPath, path.extname(subjectPath));

const written: string[] = [];
for (const theme of themes) {
	const query = new URLSearchParams({
		theme,
		preset: values.preset,
		surface: values.surface,
		pad: values.pad,
	});
	if (values.width) query.set("width", values.width);
	if (values.guides) query.set("guides", "1");
	if (values.inspect) query.set("inspect", "1");
	await page.goto(`${baseUrl}?${query}`);
	await page.waitForSelector(
		"body[data-render-ready], body[data-render-error]",
		{ timeout: 20_000 },
	);
	const renderError = await page.evaluate(() =>
		document.body.getAttribute("data-render-error"),
	);
	if (renderError) throw new Error(renderError);
	const file = path.join(outDir, `${baseName}-${theme}.png`);
	if (values["full-page"]) {
		await page.screenshot({ path: file });
	} else {
		await page.locator("#stage").screenshot({ path: file });
	}
	written.push(file);
}

await browser.close();
await server.close();
for (const file of written) console.log(file);
