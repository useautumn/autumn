#!/usr/bin/env tsx

import { watch } from "fs";
import fs from "fs/promises";
import path from "path";

const UI_REGISTRY_PATH = "../ui/registry";
const SYNCED_COMPONENTS_PATH = "./src/libraries/react/components";

interface ComponentConfig {
	syncedName: string;
	registryName: string;
	dependencies?: string[];
}

const COMPONENTS: ComponentConfig[] = [
	{
		syncedName: "checkout-dialog",
		registryName: "checkout-dialog",
		dependencies: ["checkout-content"],
	},
	{
		syncedName: "paywall-dialog",
		registryName: "paywall-dialog",
		dependencies: ["paywall-content"],
	},
	{
		syncedName: "pricing-table",
		registryName: "pricing-table",
		dependencies: ["pricing-table-content"],
	},
];

/**
 * Remove 'au-' prefixes from Tailwind classes
 */
function removeAuPrefixes(content: string): string {
	// Replace all occurrences of 'au-' with empty string in className attributes
	return content.replace(/au-/g, "");
}

/**
 * Transform imports from synced format to registry format
 */
function transformImportsToRegistry(content: string): string {
	// Transform path aliases back to autumn-js imports
	content = content.replace(/from ["']@\/index["']/g, 'from "autumn-js/react"');
	content = content.replace(/from ["']@sdk["']/g, 'from "autumn-js"');

	// Transform relative lib imports to registry format (but NOT utils)
	content = content.replace(
		/from ["'].\/lib\/(?!utils)([^"']+)["']/g,
		'from "@/registry/$COMPONENT_NAME/lib/$1"',
	);

	// Transform synced component imports back to registry format
	content = content.replace(
		/from ["']..\/([^/]+)\/\1-synced["']/g,
		'from "@/registry/$1/$1"',
	);

	// Remove loading styles import and replace with CSS classes
	if (content.includes('from "@/utils/inject-styles"')) {
		// Remove the import line
		content = content.replace(
			/import\s+{[^}]*loadingStyles[^}]*}\s+from\s+["']@\/utils\/inject-styles["'];?\s*\n/g,
			"",
		);

		// Replace inline styles with CSS classes
		content = content.replace(
			/style={loadingStyles}/g,
			'className="w-full h-full flex justify-center items-center min-h-[300px]"',
		);
		content = content.replace(
			/style={spinnerStyles}/g,
			'className="w-6 h-6 text-zinc-400 animate-spin"',
		);
	}

	// Keep @/lib/utils and @/components/ui imports as-is

	return content;
}

/**
 * Sync a single component from synced version to registry
 */
async function syncComponentToRegistry(config: ComponentConfig): Promise<void> {
	const syncedDir = path.join(SYNCED_COMPONENTS_PATH, config.syncedName);
	const registryDir = path.join(UI_REGISTRY_PATH, config.registryName);

	try {
		// Read the synced component file
		const syncedFilePath = path.join(
			syncedDir,
			`${config.syncedName}-synced.tsx`,
		);
		const syncedContent = await fs.readFile(syncedFilePath, "utf-8");

		// Transform content: remove au- prefixes and transform imports
		let transformedContent = removeAuPrefixes(syncedContent);
		transformedContent = transformImportsToRegistry(transformedContent);

		// Replace the placeholder with actual component name
		transformedContent = transformedContent.replace(
			/\$COMPONENT_NAME/g,
			config.registryName,
		);

		// Determine target path (handle subdirectory structure)
		let targetFilePath = path.join(registryDir, `${config.registryName}.tsx`);

		// Check if registry uses subdirectory structure
		const subDirPath = path.join(
			registryDir,
			config.registryName,
			`${config.registryName}.tsx`,
		);
		try {
			await fs.access(subDirPath);
			targetFilePath = subDirPath;
		} catch {
			// Use direct path
		}

		// Write the transformed content
		await fs.writeFile(targetFilePath, transformedContent);

		// Sync lib dependencies if they exist
		if (config.dependencies) {
			const syncedLibDir = path.join(syncedDir, "lib");
			const registryLibDir = path.join(registryDir, "lib");

			try {
				for (const dep of config.dependencies) {
					const syncedDepPath = path.join(syncedLibDir, `${dep}.tsx`);
					const syncedDepContent = await fs.readFile(syncedDepPath, "utf-8");

					// Transform the dependency content
					let transformedDepContent = removeAuPrefixes(syncedDepContent);
					transformedDepContent = transformImportsToRegistry(
						transformedDepContent,
					);
					transformedDepContent = transformedDepContent.replace(
						/\$COMPONENT_NAME/g,
						config.registryName,
					);

					await fs.writeFile(
						path.join(registryLibDir, `${dep}.tsx`),
						transformedDepContent,
					);
				}
			} catch (error) {
				console.warn(`No lib directory found for synced ${config.syncedName}`);
			}
		}

		console.log(
			`✅ Synced ${config.syncedName} -> registry/${config.registryName}`,
		);
	} catch (error) {
		console.error(`❌ Failed to sync ${config.syncedName}:`, error);
	}
}

/**
 * Sync all components to registry
 */
async function syncAllToRegistry(): Promise<void> {
	console.log("🔄 Syncing components to registry...");

	for (const component of COMPONENTS) {
		await syncComponentToRegistry(component);
	}

	console.log("🎉 Registry sync complete!");
}

/**
 * Watch synced components for changes
 */
function watchSyncedComponents(): void {
	console.log("👀 Watching synced components for changes...");

	// Watch each component directory
	COMPONENTS.forEach((config) => {
		const componentDir = path.join(SYNCED_COMPONENTS_PATH, config.syncedName);

		watch(componentDir, { recursive: true }, (_: any, filename: any) => {
			if (filename && filename.endsWith(".tsx")) {
				console.log(`📝 Detected change in ${config.syncedName}: ${filename}`);
				syncComponentToRegistry(config).catch(console.error);
			}
		});
	});
}

// CLI interface
const command = process.argv[2];

switch (command) {
	case "sync":
		syncAllToRegistry().catch(console.error);
		break;
	case "watch":
		syncAllToRegistry()
			.then(() => watchSyncedComponents())
			.catch(console.error);
		break;
	default:
		console.log("Usage: tsx sync-registry.ts [sync|watch]");
		console.log("  sync     - Sync synced components to registry");
		console.log("  watch    - Sync and watch synced components for changes");
}
