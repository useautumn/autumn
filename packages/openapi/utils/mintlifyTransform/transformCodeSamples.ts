/**
 * Transforms TypeScript SDK code sample from Speakeasy format to autumn-js format.
 */
export function transformTypeScriptCodeSample(source: string): string {
	// Replace import
	let result = source.replace(
		/import \{ Autumn \} from "@useautumn\/sdk";/g,
		"import { Autumn } from 'autumn-js'",
	);

	// Replace initialization with simpler version
	result = result.replace(
		/const autumn = new Autumn\(\{[\s\S]*?\}\);/g,
		"const autumn = new Autumn()",
	);

	// Remove async wrapper function - extract the inner content
	const asyncWrapperMatch = result.match(
		/async function run\(\) \{([\s\S]*?)\}\s*\n\s*run\(\);/,
	);
	if (asyncWrapperMatch) {
		const innerContent = asyncWrapperMatch[1]
			.split("\n")
			.map((line) => {
				// Remove 2 spaces of indentation from the wrapper
				if (line.startsWith("  ")) {
					return line.slice(2);
				}
				return line;
			})
			.join("\n")
			.trim();
		result = result.replace(asyncWrapperMatch[0], innerContent);
	}

	// Remove console.log
	result = result.replace(/\s*console\.log\(result\);?/g, "");

	// Clean up extra blank lines
	result = result.replace(/\n{3,}/g, "\n\n").trim();

	return result;
}

/**
 * Formats a Python function call with proper indentation if it has multiple arguments.
 * Converts: func(arg1="val1", arg2="val2", arg3="val3")
 * To:       func(
 *               arg1="val1",
 *               arg2="val2",
 *               arg3="val3",
 *           )
 */
function formatPythonFunctionCall(code: string): string {
	// Match function calls like: res = autumn.something.method(args...)
	// or just: autumn.something.method(args...)
	return code.replace(
		/((?:res\s*=\s*)?autumn\.[a-z_.]+)\(([^)]+)\)/gi,
		(_match, funcCall: string, argsStr: string) => {
			// Parse arguments - split by comma but respect strings
			const args: string[] = [];
			let current = "";
			let inString = false;
			let stringChar = "";

			for (const char of argsStr) {
				if ((char === '"' || char === "'") && !inString) {
					inString = true;
					stringChar = char;
					current += char;
				} else if (char === stringChar && inString) {
					inString = false;
					stringChar = "";
					current += char;
				} else if (char === "," && !inString) {
					args.push(current.trim());
					current = "";
				} else {
					current += char;
				}
			}
			if (current.trim()) {
				args.push(current.trim());
			}

			// If 2 or fewer args and short enough, keep on one line
			const singleLine = `${funcCall}(${args.join(", ")})`;
			if (args.length <= 2 && singleLine.length <= 60) {
				return singleLine;
			}

			// Format with each arg on its own line
			const indent = "    ";
			const formattedArgs = args.map((arg) => `${indent}${arg},`).join("\n");
			return `${funcCall}(\n${formattedArgs}\n)`;
		},
	);
}

/**
 * Transforms Python SDK code sample from Speakeasy format to cleaner format.
 */
export function transformPythonCodeSample(source: string): string {
	// Replace the "with Autumn(...) as autumn:" pattern with simple initialization
	// Match: with Autumn(\n    x_api_version="...",\n    secret_key="...",\n) as autumn:
	let result = source.replace(
		/from autumn_sdk import Autumn\s*\n\s*with Autumn\([\s\S]*?\) as autumn:/g,
		'from autumn_sdk import Autumn\n\nautumn = Autumn(secret_key="am_sk_test...")',
	);

	// If the above didn't match, try simpler pattern
	result = result.replace(
		/with Autumn\([\s\S]*?\) as autumn:/g,
		'autumn = Autumn(secret_key="am_sk_test...")',
	);

	// Remove the extra indentation from the body (was inside "with" block)
	// Split into lines, find lines after "autumn = Autumn(...)" and dedent them
	const lines = result.split("\n");
	const processedLines: string[] = [];
	let foundInit = false;

	for (const line of lines) {
		if (line.includes("autumn = Autumn(")) {
			foundInit = true;
			processedLines.push(line);
			continue;
		}

		if (foundInit && line.startsWith("    ")) {
			// Remove one level of indentation (4 spaces)
			processedLines.push(line.slice(4));
		} else {
			processedLines.push(line);
		}
	}

	result = processedLines.join("\n");

	// Remove "# Handle response" comment and print statement
	result = result.replace(/\s*# Handle response\s*/g, "\n");
	result = result.replace(/\s*print\(res\)\s*/g, "");

	// Format long function calls with proper indentation
	result = formatPythonFunctionCall(result);

	// Clean up extra blank lines
	result = result.replace(/\n{3,}/g, "\n\n").trim();

	return result;
}
