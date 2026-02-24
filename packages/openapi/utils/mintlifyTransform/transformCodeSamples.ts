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
 * Handles nested brackets (lists, dicts) correctly.
 * Converts: func(arg1="val1", arg2=[{...}], arg3="val3")
 * To:       func(
 *               arg1="val1",
 *               arg2=[{...}],
 *               arg3="val3",
 *           )
 */
function formatPythonFunctionCall(code: string): string {
	// Find function calls like: res = autumn.something.method(...)
	// We need to find the matching closing paren, accounting for nested brackets
	const funcCallPattern = /((?:res\s*=\s*)?autumn\.[a-z_.]+)\(/gi;
	let result = code;
	let match: RegExpExecArray | null = null;

	// Process from end to start to preserve indices
	const matches: { start: number; end: number; funcCall: string }[] = [];
	match = funcCallPattern.exec(code);
	while (match !== null) {
		const funcCall = match[1];
		const argsStart = match.index + match[0].length;

		// Find the matching closing paren
		let depth = 1;
		let i = argsStart;
		let inString = false;
		let stringChar = "";

		while (i < code.length && depth > 0) {
			const char = code[i];
			const prevChar = i > 0 ? code[i - 1] : "";

			if ((char === '"' || char === "'") && !inString && prevChar !== "\\") {
				inString = true;
				stringChar = char;
			} else if (char === stringChar && inString && prevChar !== "\\") {
				inString = false;
				stringChar = "";
			} else if (!inString) {
				if (char === "(" || char === "[" || char === "{") {
					depth++;
				} else if (char === ")" || char === "]" || char === "}") {
					depth--;
				}
			}
			i++;
		}

		if (depth === 0) {
			matches.push({
				start: match.index,
				end: i,
				funcCall,
			});
		}
		match = funcCallPattern.exec(code);
	}

	// Process matches from end to start
	for (let m = matches.length - 1; m >= 0; m--) {
		const { start, end, funcCall } = matches[m];
		const argsStr = code.slice(start + funcCall.length + 1, end - 1);

		// Parse top-level arguments - split by comma but respect strings and nested brackets
		const args: string[] = [];
		let current = "";
		let inString = false;
		let stringChar = "";
		let bracketDepth = 0;

		for (let j = 0; j < argsStr.length; j++) {
			const char = argsStr[j];
			const prevChar = j > 0 ? argsStr[j - 1] : "";

			if ((char === '"' || char === "'") && !inString && prevChar !== "\\") {
				inString = true;
				stringChar = char;
				current += char;
			} else if (char === stringChar && inString && prevChar !== "\\") {
				inString = false;
				stringChar = "";
				current += char;
			} else if (!inString) {
				if (char === "(" || char === "[" || char === "{") {
					bracketDepth++;
					current += char;
				} else if (char === ")" || char === "]" || char === "}") {
					bracketDepth--;
					current += char;
				} else if (char === "," && bracketDepth === 0) {
					args.push(current.trim());
					current = "";
				} else {
					current += char;
				}
			} else {
				current += char;
			}
		}
		if (current.trim()) {
			args.push(current.trim());
		}

		// If 2 or fewer simple args and short enough, keep on one line
		const hasComplexArg = args.some(
			(arg) => arg.includes("[") || arg.includes("{") || arg.includes("\n"),
		);
		const singleLine = `${funcCall}(${args.join(", ")})`;
		if (args.length <= 2 && singleLine.length <= 60 && !hasComplexArg) {
			result = result.slice(0, start) + singleLine + result.slice(end);
			continue;
		}

		// Format with each arg on its own line, properly indenting nested structures
		const indent = "    ";
		const formattedArgs = args
			.map((arg) => {
				// If arg contains nested structures, re-indent them
				if (arg.includes("\n")) {
					const lines = arg.split("\n");
					const reindented = lines
						.map((line, lineIndex) => {
							if (lineIndex === 0) {
								return `${indent}${line.trim()}`;
							}
							// Preserve relative indentation of nested content
							const trimmed = line.trimStart();
							const originalIndent = line.length - line.trimStart().length;
							// Calculate how many levels deep this line is (each level = 4 spaces)
							const levels = Math.floor(originalIndent / 4);
							return `${indent}${indent.repeat(levels)}${trimmed}`;
						})
						.join("\n");
					return `${reindented},`;
				}
				return `${indent}${arg},`;
			})
			.join("\n");
		const formatted = `${funcCall}(\n${formattedArgs}\n)`;
		result = result.slice(0, start) + formatted + result.slice(end);
	}

	return result;
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
