import { CircleAlert, RotateCw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { ApiRequestError } from "../api/client.ts";
import { Button } from "./ui.tsx";

const describe = (error: unknown) => {
	if (isRouteErrorResponse(error))
		return {
			title: error.status === 404 ? "Page not found" : `Error ${error.status}`,
			message:
				error.status === 404
					? "Nothing lives at this address."
					: error.statusText || "The page failed to load.",
		};
	if (error instanceof ApiRequestError)
		return { title: "twd returned an error", message: error.body.message };
	return {
		title: "Something broke on this page",
		message: error instanceof Error ? error.message : String(error),
	};
};

/** Route errorElement: replaces react-router's developer screen. */
export const RouteError = () => {
	const error = useRouteError();
	const { title, message } = describe(error);
	console.error("twd route error", error);
	return (
		<div className="flex min-h-[60vh] w-full items-center justify-center p-6 text-foreground">
			<div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
				<div className="flex items-start gap-2">
					<CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
					<div className="min-w-0 space-y-1">
						<p className="text-sm font-medium">{title}</p>
						<p className="font-mono text-xs break-words text-tertiary-foreground">
							{message}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 pl-6">
					<Button variant="secondary" onClick={() => window.location.reload()}>
						<RotateCw className="size-3.5" /> Reload
					</Button>
					<Link
						to="/"
						className="text-sm text-tertiary-foreground hover:text-foreground"
					>
						Back to Runs
					</Link>
				</div>
			</div>
		</div>
	);
};
