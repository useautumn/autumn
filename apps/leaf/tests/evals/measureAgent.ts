import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
let agentId: string | undefined;
for await (const a of client.beta.agents.list()) {
	if (a.name === "Autumn Leaf (eval)") {
		agentId = a.id;
		break;
	}
}
if (agentId) {
	const a = await client.beta.agents.retrieve(agentId);
	const sys = (a.system ?? "").length;
	const toolsArr = (a.tools ?? []) as unknown[];
	const tools = JSON.stringify(toolsArr).length;
	const skillsArr = (a.skills ?? []) as unknown[];
	const skills = JSON.stringify(skillsArr).length;
	const est = (n: number) => Math.round(n / 4);
	process.stdout.write(`system: ${sys} chars (~${est(sys)} tok)\n`);
	process.stdout.write(
		`tools:  ${tools} chars (~${est(tools)} tok)  [${toolsArr.length} entries]\n`,
	);
	process.stdout.write(
		`skills: ${skills} chars (~${est(skills)} tok)  [${skillsArr.length} skills]\n`,
	);
	process.stdout.write(
		`TOTAL static: ${sys + tools + skills} chars (~${est(sys + tools + skills)} tok)\n`,
	);
} else {
	process.stdout.write("no eval agent found\n");
}
