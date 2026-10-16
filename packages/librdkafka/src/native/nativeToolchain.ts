/** The glibc the addon links against and the compiler that builds it, e.g. "glibc 2.41; c++ (Debian 14.2.0-19) 14.2.0". */
export function nativeToolchainOf(): string {
	const report = process.report?.getReport() as
		| { header?: { glibcVersionRuntime?: string } }
		| undefined;
	const glibc = report?.header?.glibcVersionRuntime;
	const libc = glibc ? `glibc ${glibc}` : "libc unknown";
	const compiler = Bun.which("c++")
		? Bun.spawnSync(["c++", "--version"]).stdout.toString().split("\n")[0]
		: "no c++";
	return `${libc}; ${compiler}`;
}
