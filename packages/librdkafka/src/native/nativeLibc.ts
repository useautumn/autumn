/** The libc family the addon links against. Versions are left out so one CI build serves every glibc machine. */
export function nativeLibcOf(): "glibc" | "musl" | "none" {
	if (process.platform !== "linux") return "none";
	const report = process.report?.getReport() as
		| { header?: { glibcVersionRuntime?: string } }
		| undefined;
	return report?.header?.glibcVersionRuntime ? "glibc" : "musl";
}
