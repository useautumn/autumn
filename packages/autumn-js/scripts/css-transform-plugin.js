import fs from "fs";
import path from "path";

// esbuild plugin to transform CSS before injection
export function cssTransformPlugin() {
	return {
		name: "css-transform",
		setup(build) {
			// Process CSS files before they get injected
			build.onLoad({ filter: /\.css$/ }, async (args) => {
				const cssContent = await fs.promises.readFile(args.path, "utf8");

				// Apply the same transformation as post-build.js
				const transformedCss = cssContent.replace(
					/(\*,\n::before,\n::after)/g,
					".au-root *,\n.au-root ::before,\n.au-root ::after",
				);

				console.log(`🎨 Transformed CSS: ${path.basename(args.path)}`);

				return {
					contents: transformedCss,
					loader: "css",
				};
			});
		},
	};
}
