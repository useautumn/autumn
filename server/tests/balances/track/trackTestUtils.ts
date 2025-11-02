import { SuccessCode, type TrackResponse } from "@autumn/shared";

export const trackWasSuccessful = ({ res }: { res: TrackResponse }) => {
	return res.code === SuccessCode.EventReceived;
};
