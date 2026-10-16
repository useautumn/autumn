export const CONFLUENT_PACKAGE = "@confluentinc/kafka-javascript";
export const CONFLUENT_VERSION = "1.10.0";
/** The addon file name `bindings` looks for under the package's build/Release. */
export const NATIVE_BINARY_FILE = "confluent-kafka-javascript.node";
/** Bump when the build recipe changes without the sources changing. */
export const NATIVE_BUILD_RECIPE = 2;
/** CI publishes each Linux glibc build here, under the `librdkafka-addon-<key>` release. */
export const PREBUILT_ADDON_URL = (key: string) =>
	`https://github.com/useautumn/autumn/releases/download/librdkafka-addon-${key}/${key}.node`;
