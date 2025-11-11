import { SuccessCode, type TrackResponseV1 } from "@autumn/shared";

export const trackWasSuccessful = ({ res }: { res: TrackResponseV1 }) => {
	return res.code === SuccessCode.EventReceived;
};
