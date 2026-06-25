import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 640;

/** Returns true when viewport width is below the given breakpoint (default: sm/640px). */
export function useIsMobile(mobileBreakpoint = MOBILE_BREAKPOINT) {
	const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

	useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);
		const onChange = () => {
			setIsMobile(window.innerWidth < mobileBreakpoint);
		};
		mql.addEventListener("change", onChange);
		setIsMobile(window.innerWidth < mobileBreakpoint);
		return () => mql.removeEventListener("change", onChange);
	}, [mobileBreakpoint]);

	return !!isMobile;
}
