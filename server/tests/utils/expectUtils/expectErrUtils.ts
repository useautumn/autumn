import { assert, expect } from "chai";
import { ErrCode } from "@autumn/shared";
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
		let result = await func();

		assert.fail(
			`Expected to receive autumn error ${errCode}, but received none`,
		);
	} catch (error: any) {
		// 1. Expect error to be instance of AutumnError

		expect(error, "Error should be instance of AutumnError").to.be.instanceOf(
			AutumnError,
		);

		if (errMessage) {
			expect(error.message, `Error message should be ${errMessage}`).to.equal(
				errMessage,
			);
		}

		if (errCode) {
			// 2. Expect error code to be the same as the one passed in
			expect(error.code, `Error code should be ${errCode}`).to.equal(errCode);
		}
	}
};
