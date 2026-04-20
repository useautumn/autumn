/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: ["*.ngrok-free.dev"],

	async headers() {
		const linkHeader = [
			'<https://docs.useautumn.com>; rel="service-doc"',
			'<https://raw.githubusercontent.com/useautumn/autumn/refs/heads/dev/packages/openapi/openapi.yml>; rel="service-desc"; type="application/yaml"',
			'</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
			'<https://docs.useautumn.com>; rel="describedby"',
		].join(", ");

		return [
			{
				source: "/:path*",
				headers: [{ key: "Link", value: linkHeader }],
			},
		];
	},
};

export default nextConfig;
