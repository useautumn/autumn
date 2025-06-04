import { assert, expect } from "chai";
import { ErrCode } from "@autumn/shared";
import AutumnError from "@/external/autumn/autumnCli.js";

export const expectAutumnError = async ({
  errCode,
  func,
}: {
  errCode: string;
  func: () => Promise<any>;
}) => {
  try {
    await func();

    assert.fail(
      `Expected to receive autumn error ${errCode}, but received none`,
    );
  } catch (error: any) {
    // 1. Expect error to be instance of AutumnError
    expect(error, "Error should be instance of AutumnError").to.be.instanceOf(
      AutumnError,
    );

    // 2. Expect error code to be the same as the one passed in
    expect(error.code, `Error code should be ${errCode}`).to.equal(errCode);
  }
};
