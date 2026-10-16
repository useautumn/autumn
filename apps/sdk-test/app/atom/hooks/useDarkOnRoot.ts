import { useEffect } from "react";

// The ui theme resolves its tokens at :root, so dark mode has to sit on <html>.
export const useDarkOnRoot = () => {
  useEffect(() => {
    const root = document.documentElement;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      root.classList.remove("dark");
    };
  }, []);
};
