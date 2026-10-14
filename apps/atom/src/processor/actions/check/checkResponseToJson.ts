import { type CheckResponseV3, stripInternalFields } from "@autumn/shared";

export const checkResponseToJson = ({
	response,
}: {
	response: CheckResponseV3;
}): string => JSON.stringify(stripInternalFields({ data: response }));
