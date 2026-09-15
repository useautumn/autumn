import type { Command } from "commander";
import {
	requireSecretKey,
	type Target,
	targetBaseUrl,
} from "../../env/resolveTarget";
import { API_ROUTES, type ApiRoute } from "../../generated/apiRoutes";
import {
	ApiResponseError,
	buildApiRequest,
	callApi,
	parseFieldArgs,
	renderApiResponseError,
	renderCurl,
} from "./callApi";

const SUMMARY_MAX = 80;

/** The first sentence, clipped: the group listing is a table, the method's own --help carries the rest. */
export const summarize = ({ text }: { text: string }): string => {
	const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
	return sentence.length <= SUMMARY_MAX
		? sentence
		: `${sentence.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
};

const fieldHelp = ({ route }: { route: ApiRoute }): string => {
	if (route.body === "none") return "\nTakes no body.";
	if (route.body === "array")
		return "\nTakes a JSON array: pass it with --body '[...]' or --body - (stdin).";
	const width = Math.max(0, ...route.fields.map((field) => field.name.length));
	return [
		"\nFields (key=value; json values are parsed):",
		...route.fields.map((field) => {
			const type = `${field.type}${field.required ? ", required" : ""}`;
			return `  ${field.name.padEnd(width)}  ${type.padEnd(18)}${field.description ?? ""}`.trimEnd();
		}),
	].join("\n");
};

/**
 * One subcommand per public RPC route, straight off the spec: `atmn api
 * balances check customer_id=cus_1 feature_id=messages`. Nothing here knows
 * what any route does; the spec's own description is the help.
 */
export const registerApiCommands = ({
	program,
	targetOf,
}: {
	program: Command;
	targetOf: (command: Command) => Target;
}): void => {
	const api = program
		.command("api")
		.description(
			"call any public API route: atmn api <group> <method> [key=value...]",
		);
	const groups = new Map<string, Command>();
	for (const route of API_ROUTES) {
		let group = groups.get(route.group);
		if (group === undefined) {
			group = api.command(route.group).description(`${route.group}.* routes`);
			groups.set(route.group, group);
		}
		group
			.command(route.method)
			.summary(summarize({ text: route.description ?? route.path }))
			.description(route.description ?? route.path)
			.argument("[fields...]", "body fields as key=value")
			.option("--body <json>", "the whole JSON body; - reads stdin")
			.option(
				"-H, --header <header>",
				'an extra request header, "name: value"; repeatable',
				(value: string, previous: string[] = []) => [...previous, value],
			)
			.option(
				"--curl",
				"print the request as a curl command instead of sending it",
			)
			.addHelpText("after", fieldHelp({ route }))
			.action(
				async (
					args: string[],
					options: { body?: string; header?: string[]; curl?: boolean },
					command: Command,
				) => {
					const target = targetOf(command);
					const call = {
						route,
						baseUrl: targetBaseUrl({ target }),
						secretKey: requireSecretKey({ target }),
						...(options.body === undefined ? {} : { body: options.body }),
						fields: parseFieldArgs({ args }),
						headers: options.header ?? [],
					};
					if (options.curl === true) {
						process.stdout.write(
							`${renderCurl({
								request: await buildApiRequest(call),
								secretKey: call.secretKey,
								secretKeyName: target.secretKeyName,
							})}\n`,
						);
						return;
					}
					try {
						const response = await callApi(call);
						process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
					} catch (error) {
						// The server's reply is the answer, so it is shown whole: the
						// status line on stderr, the body on stdout like a success.
						if (!(error instanceof ApiResponseError)) throw error;
						const { statusLine, body } = renderApiResponseError({ error });
						process.stderr.write(`${statusLine}\n`);
						process.stdout.write(`${body}\n`);
						process.exitCode = 1;
					}
				},
			);
	}
};
