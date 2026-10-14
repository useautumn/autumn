import { expect } from "bun:test";
import assert from "node:assert";
import AutumnError from "@/external/autumn/autumnCli.js";

export const expectAutumnError = async ({
	errCode,
	errMessage,
	func,
}: {
	errCode?: string;
	errMessage?: string;
	func: () => Promise<any>;
}) => {
	try {
		const res = await func();

		console.log("Res: ", res);

		assert.fail(
			`Expected to receive autumn error ${errCode}, but received none`,
		);
	} catch (error: any) {
		expect(error, "Error should be instance of AutumnError").toBeInstanceOf(
			AutumnError,
		);

		if (errMessage) {
			expect(error.message, `Error message should be ${errMessage}`).toInclude(
				errMessage,
			);
		}

		if (errCode) {
			expect(error.code, `Error code should be ${errCode}`).toBe(errCode);
		}
	}
};
