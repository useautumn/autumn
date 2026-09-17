import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = Bun.YAML.parse(
	readFileSync(
		new URL("../workflows/post-cubic-summary.yml", import.meta.url),
		"utf8",
	),
) as { jobs: Record<string, { steps: { run: string }[] }> };
const summaryScript = workflow.jobs["notify-shipped"].steps[0].run;
const payloadBoundary = "\nexport PR_URL SLACK_MESSAGE";
if (!summaryScript.includes(payloadBoundary)) {
	throw new Error("Cannot locate the end of the workflow message formatter");
}
// Exercise the real workflow formatter, stopping before payload writes or HTTP calls.
const formatterScript = `${summaryScript.split(payloadBoundary)[0]}\nprintf '%s' "$SLACK_MESSAGE"`;

const formatMessage = ({
	body,
	branch = "dev",
}: {
	body: string;
	branch?: string;
}) => {
	const result = Bun.spawnSync(
		["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", formatterScript],
		{
			env: {
				PATH: process.env.PATH,
				DEPLOY_URL: "https://example.invalid",
				DEPLOY_SECRET: "test-only",
				PR_BODY: body,
				PR_HEAD_REF: branch,
				PR_NUMBER: "3472",
				PR_URL: "https://github.com/useautumn/autumn/pull/3472",
			},
		},
	);
	return {
		exitCode: result.exitCode,
		text: result.stdout.toString(),
		error: result.stderr.toString(),
	};
};

const summary =
	"Adds a consistent rocket-reaction merge instruction.\n- **Improvements:** Preserves the footer.";
const agentPrompt = `<details><summary>Fix with agent prompt</summary>
\`\`\`\`\`markdown
### Issue 1
GitHub does not start \`check_suite\` workflows for checks created by GitHub Actions.
For each issue above, determine whether it is valid and should be fixed.
\`\`\`\`\`
</details>`;
const diagram =
	"<details><summary>Diagram</summary>Do not post this diagram.</details>";
const greptileBody = ({
	heading = "Summary",
	content = summary,
}: {
	heading?: string;
	content?: string;
} = {}) =>
	`<!-- greptile_comment -->\n${agentPrompt}\n<details><summary>${heading}</summary>\n${content}\n</details>\n${diagram}\n<!-- /greptile_comment -->`;
const cubicBody =
	"<!-- This is an auto-generated description by cubic. -->\n## Summary by cubic\nCubic release summary.\n<sup>Cubic footer</sup>";

test("posts the Summary instead of the earlier agent prompt from PR 3472", () => {
	const result = formatMessage({ body: greptileBody() });
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain(
		"Adds a consistent rocket-reaction merge instruction.",
	);
	expect(result.text).toContain("*Improvements:* Preserves the footer.");
	expect(result.text).not.toContain("Issue 1");
	expect(result.text).not.toContain("check_suite");
	expect(result.text).not.toContain("determine whether");
	expect(result.text).not.toContain("Do not post this diagram");
	expect(result.text).toContain("*dev2main* :rocket:");
	expect(result.text).toContain(
		"<https://github.com/useautumn/autumn/pull/3472|PR #3472>",
	);
	expect(result.text).toEndWith(
		"_When CI is green, react with :rocket: to merge._",
	);
});

test.each([
	"Greptile Summary",
	"<h3>Greptile Summary</h3>",
	"\n <h3> Greptile Summary </h3>\n",
])("supports historical Greptile heading %s", (heading) => {
	const result = formatMessage({ body: greptileBody({ heading }) });
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain(
		"Adds a consistent rocket-reaction merge instruction.",
	);
	expect(result.text).not.toContain("Issue 1");
});

test("supports a summary before other sections", () => {
	const result = formatMessage({
		body: greptileBody().replace(agentPrompt, ""),
	});
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain(
		"Adds a consistent rocket-reaction merge instruction.",
	);
	expect(result.text).not.toContain("Do not post this diagram");
});

test.each([
	`<!-- greptile_comment -->${agentPrompt}${diagram}<!-- /greptile_comment -->`,
	greptileBody({ content: " \n " }),
	"<!-- greptile_comment --><details><summary>Summary</summary>Unclosed section",
	`<!-- greptile_comment -->${agentPrompt}<!-- /greptile_comment --><details><summary>Summary</summary>Unrelated summary</details>`,
])("rejects absent, empty, unclosed, or out-of-region summaries", (body) => {
	const result = formatMessage({ body });
	expect(result.exitCode).not.toBe(0);
	expect(`${result.text}${result.error}`).toContain("Greptile summary");
	expect(result.text).not.toContain("react with :rocket:");
});

test("preserves Cubic extraction and precedence when Cubic comes first", () => {
	const result = formatMessage({ body: `${cubicBody}\n${greptileBody()}` });
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain("Cubic release summary.");
	expect(result.text).not.toContain("Summary by cubic");
	expect(result.text).not.toContain("Cubic footer");
	expect(result.text).not.toContain("Adds a consistent");
});

test("preserves Greptile precedence when it comes before Cubic", () => {
	const result = formatMessage({ body: `${greptileBody()}\n${cubicBody}` });
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain(
		"Adds a consistent rocket-reaction merge instruction.",
	);
	expect(result.text).not.toContain("Cubic release summary.");
});

test("preserves branch labels and escaping without evaluating summary content", () => {
	const result = formatMessage({
		body: greptileBody({
			content: "**Safe** <text> & $(printf unsafe-command)",
		}),
		branch: "fix/summary&footer",
	});
	expect(result.exitCode).toBe(0);
	expect(result.text).toContain("*fix/summary&amp;footer → main*");
	expect(result.text).toContain(
		"*Safe* &lt;text&gt; &amp; $(printf unsafe-command)",
	);
});

test("the complete workflow summary step has valid Bash syntax", () => {
	const result = Bun.spawnSync(["bash", "-n"], {
		stdin: Buffer.from(summaryScript),
	});
	expect(result.exitCode).toBe(0);
});
