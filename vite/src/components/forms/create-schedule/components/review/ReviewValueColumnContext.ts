import { createContext, useContext } from "react";

const ReviewValueColumnContext = createContext<string | undefined>(undefined);

export const ReviewValueColumnProvider = ReviewValueColumnContext.Provider;

export const useReviewValueColumnWidth = () =>
	useContext(ReviewValueColumnContext);
