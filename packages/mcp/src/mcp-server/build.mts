/// <reference types="bun-types" />

import { build } from "bun";
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { packExtension } from "@anthropic-ai/mcpb";
import { join } from "node:path";
import { createMCPServer } from "./agent/server.ts";

const shouldPack = process.argv.includes("--pack");

async function buildMcpServer() {
  const { tools } = await createMCPServer().getToolListInfo();
  const manifest = await readFile("manifest.json", "utf8");
  const manifestJson = JSON.parse(manifest);

  manifestJson.tools = [];
  manifestJson.tools.push(...tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
  })));

  await writeFile("manifest.json", JSON.stringify(manifestJson, null, 2));
  const entrypoint = "./src/mcp-server/mcp-server.ts";
  const destinationDir = "./bin";

  await build({
    entrypoints: [entrypoint],
    outdir: destinationDir,
    sourcemap: shouldPack ? "none" : "linked",
    target: "node",
    format: "esm",
    minify: shouldPack,
    throw: true,
    banner: "#!/usr/bin/env node",
  });

  const outputFile = join(destinationDir, "mcp-server.js");
  await chmod(outputFile, 0o755);

  if (shouldPack) {
    const stageDir = ".mcpb-stage";
    await rm(stageDir, { recursive: true, force: true });
    await mkdir(join(stageDir, "bin"), { recursive: true });
    await cp(
      join(destinationDir, "mcp-server.js"),
      join(stageDir, "bin", "mcp-server.js"),
    );
    await cp("manifest.json", join(stageDir, "manifest.json"));

    const assetExts = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    for (const file of await readdir(".")) {
      if (assetExts.some((ext) => file.toLowerCase().endsWith(ext))) {
        await cp(file, join(stageDir, file));
      }
    }

    await packExtension({
      extensionPath: stageDir,
      outputPath: "./mcp-server.mcpb",
      silent: false,
    });

    await rm(stageDir, { recursive: true, force: true });
  }
}

await buildMcpServer().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
