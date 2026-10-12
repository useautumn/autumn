/** Accepts server/tests/x, tests/x or x and returns x, the server/tests-relative id twd stores. */
export const toTestId = ({ file }: { file: string }) =>
	file
		.trim()
		.replace(/^\.\//, "")
		.replace(/^server\//, "")
		.replace(/^tests\//, "");
