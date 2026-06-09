import { useCallback, useMemo, useState } from "react";

type CursorState = {
	resetKey: string;
	stack: string[];
};

export function useCursorPagination({
	pageSize,
	resetKey = "",
}: {
	pageSize: number;
	resetKey?: string;
}) {
	const [state, setState] = useState<CursorState>({
		resetKey,
		stack: [""],
	});
	const cursorStack = state.resetKey === resetKey ? state.stack : [""];
	const currentPage = cursorStack.length;
	const currentCursor = cursorStack[cursorStack.length - 1] ?? "";
	const pagination = useMemo(
		() => ({ pageIndex: currentPage - 1, pageSize }),
		[currentPage, pageSize],
	);

	return {
		currentCursor,
		currentPage,
		pagination,
		canPrev: currentPage > 1,
		pushCursor: useCallback(
			(cursor: string) =>
				setState((prev) => ({
					resetKey,
					stack: [
						...(prev.resetKey === resetKey ? prev.stack : [""]),
						cursor,
					],
				})),
			[resetKey],
		),
		popCursor: useCallback(
			() =>
				setState((prev) => {
					const stack = prev.resetKey === resetKey ? prev.stack : [""];
					return {
						resetKey,
						stack: stack.length > 1 ? stack.slice(0, -1) : stack,
					};
				}),
			[resetKey],
		),
	};
}
