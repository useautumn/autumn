import SmallSpinner from "@/components/general/SmallSpinner";

export const colorizeJSON = (json: any) => {
	const jsonString = JSON.stringify(json, null, 2);
	return jsonString?.replace(/\btrue\b|\bfalse\b/g, (match) =>
		match === "true"
			? `<span class="text-lime-500">true</span>`
			: `<span class="text-red-400">false</span>`,
	);
};

export const APIPlayground = ({
	title,
	endpoint,
	request,
	response,
	loading,
}: {
	title: string;
	endpoint: string;
	request: any;
	response: any;
	loading: boolean;
}) => {
	return (
		<div className="flex flex-col gap-4 bg-gray-900 p-4 rounded-sm">
			<div className="flex flex-col gap-2">
				<p className="text-md font-semibold text-white">{title}</p>
				<pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
					{endpoint}
				</pre>
			</div>

			<div className="flex flex-col gap-2">
				<p className="text-sm text-gray-400">Request</p>
				<pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
					{JSON.stringify(request, null, 2)}
				</pre>
			</div>

			<div className="flex flex-col gap-2">
				<p className="text-sm text-gray-400">Response</p>
				<pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
					{loading ? (
						<SmallSpinner />
					) : response === null ? (
						"No response"
					) : (
						<div
							dangerouslySetInnerHTML={{
								__html: colorizeJSON(response),
							}}
						/>
					)}
				</pre>
			</div>
		</div>
	);
};
