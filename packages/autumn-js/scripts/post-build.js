const fs = require("fs");
const path = require("path");

// Post-build processing: replace CSS selectors with .au-root prefix
function processCssFiles() {
	const cssFiles = [
		path.join(__dirname, "../dist/styles/global.css"),
		path.join(__dirname, "../dist/libraries/react/index.css"),
	];

	cssFiles.forEach((cssFilePath) => {
		if (fs.existsSync(cssFilePath)) {
			console.log("📄 Processing CSS file:", cssFilePath);

			const builtCss = fs.readFileSync(cssFilePath, "utf8");
			let updatedCss = builtCss.replace(
				/(\*,\n::before,\n::after)/g,
				".au-root *,\n.au-root ::before,\n.au-root ::after",
			);

			// Also handle standalone * selectors (for custom base styles)
			updatedCss = updatedCss.replace(/^(\* \{[^}]*\})$/gm, (match) =>
				match.replace("* {", ".au-root * {"),
			);

			// Handle body selector
			updatedCss = updatedCss.replace(/^(body \{[^}]*\})$/gm, (match) =>
				match.replace("body {", ".au-root body {"),
			);

			// Handle ::backdrop selector
			updatedCss = updatedCss.replace(/^(::backdrop \{[^}]*\})$/gm, (match) =>
				match.replace("::backdrop {", ".au-root ::backdrop {"),
			);

			// Handle :root selector - scope to .au-root as the root container
			updatedCss = updatedCss.replace(/^(:root \{[^}]*\})$/gm, (match) =>
				match.replace(":root {", ".au-root {"),
			);

			// Handle .dark selector - support both .au-root.dark and .dark .au-root patterns
			updatedCss = updatedCss.replace(/^(\.dark \{[^}]*\})$/gm, (match) => {
				const content = match.replace(".dark {", "").replace(/^\s*\}$/, "");
				return `.au-root.dark {\n${content}\n}\n.dark .au-root {\n${content}\n}`;
			});

			fs.writeFileSync(cssFilePath, updatedCss);
			console.log("✅ CSS selectors updated with .au-root prefix");
		} else {
			console.log("⚠️ CSS file not found:", cssFilePath);
		}
	});
}

// Process injected CSS in JS files
function processInjectedCss() {
	const reactDir = path.join(__dirname, "../dist/libraries/react");
	const files = fs
		.readdirSync(reactDir)
		.filter(
			(file) =>
				file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs"),
		);

	files.forEach((file) => {
		const filePath = path.join(reactDir, file);
		const content = fs.readFileSync(filePath, "utf8");

		// Check if this file has styleInject and CSS content
		if (content.includes("styleInject")) {
			let updated = false;
			let updatedContent = content;

			// Pattern 1: *,\n::before,\n::after (with newlines)
			if (updatedContent.includes("*,\\n::before,\\n::after")) {
				console.log("📄 Processing injected CSS pattern 1 in:", file);
				updatedContent = updatedContent.replace(
					/(\*,\\n::before,\\n::after)/g,
					".au-root *,\\n.au-root ::before,\\n.au-root ::after",
				);
				updated = true;
			}

			// Pattern 2: *,::before,::after (without newlines)
			if (updatedContent.includes("*,::before,::after")) {
				console.log("📄 Processing injected CSS pattern 2 in:", file);
				updatedContent = updatedContent.replace(
					/(\*,::before,::after)/g,
					".au-root *,.au-root ::before,.au-root ::after",
				);
				updated = true;
			}

			// Pattern 3: standalone * selector (for custom base styles)
			// Check for both escaped and unescaped versions
			if (updatedContent.includes("\\* {") || updatedContent.includes("* {")) {
				console.log("📄 Processing standalone * selector in:", file);
				// Handle escaped version
				updatedContent = updatedContent.replace(/(\\\* \{[^}]*\})/g, (match) =>
					match.replace("\\* {", ".au-root * {"),
				);
				// Handle unescaped version in JS strings
				updatedContent = updatedContent.replace(/(\* \{[^}]*\})/g, (match) =>
					match.replace("* {", ".au-root * {"),
				);
				updated = true;
			}

			// Pattern 4: body selector
			if (updatedContent.includes("body {")) {
				console.log("📄 Processing body selector in:", file);
				updatedContent = updatedContent.replace(/(body \{[^}]*\})/g, (match) =>
					match.replace("body {", ".au-root body {"),
				);
				updated = true;
			}

			// Pattern 5: ::backdrop selector
			if (updatedContent.includes("::backdrop {")) {
				console.log("📄 Processing ::backdrop selector in:", file);
				updatedContent = updatedContent.replace(
					/(::backdrop \{[^}]*\})/g,
					(match) => match.replace("::backdrop {", ".au-root ::backdrop {"),
				);
				updated = true;
			}

			// Pattern 6: :root selector - scope to .au-root as the root container
			if (updatedContent.includes(":root {")) {
				console.log("📄 Processing :root selector in:", file);
				updatedContent = updatedContent.replace(/(:root \{[^}]*\})/g, (match) =>
					match.replace(":root {", ".au-root {"),
				);
				updated = true;
			}

			// Pattern 7: .dark selector - support both patterns
			if (updatedContent.includes(".dark {")) {
				console.log("📄 Processing .dark selector in:", file);
				updatedContent = updatedContent.replace(
					/(\.dark \{[^}]*\})/g,
					(match) => {
						const content = match.replace(".dark {", "").replace(/\}$/, "");
						return `.au-root.dark {${content}}.dark .au-root {${content}}`;
					},
				);
				updated = true;
			}

			if (updated) {
				fs.writeFileSync(filePath, updatedContent);
				console.log("✅ Injected CSS selectors updated with .au-root prefix");
			}
		}
	});
}

// Run the processing
processCssFiles();
processInjectedCss();
