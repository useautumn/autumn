/** A shared library imported `with { type: "file" }`: its path, embedded in a compiled binary. */
declare module "*.so" {
	const path: string;
	export default path;
}
