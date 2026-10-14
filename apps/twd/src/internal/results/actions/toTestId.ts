export const toTestId = ({ file }: { file: string }) =>
	file
		.trim()
		.replace(/^\.\//, "")
		.replace(/^server\//, "")
		.replace(/^tests\//, "");
