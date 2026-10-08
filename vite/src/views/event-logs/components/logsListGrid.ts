import type { CSSProperties } from "react";

export const ROW_HEIGHT = 40;

/** One grid template for the header and every row, so columns always line up. */
export const ROW_GRID: CSSProperties = {
	display: "grid",
	gridTemplateColumns:
		"130px minmax(0, 200px) minmax(0, 200px) 80px minmax(0, 1fr)",
	columnGap: "16px",
	alignItems: "center",
};
