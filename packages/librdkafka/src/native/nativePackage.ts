export const CONFLUENT_PACKAGE = "@confluentinc/kafka-javascript";
export const CONFLUENT_VERSION = "1.10.0";
/** The addon file name `bindings` looks for under the package's build/Release. */
export const NATIVE_BINARY_FILE = "confluent-kafka-javascript.node";
/** Bump when the build recipe changes without the sources changing. */
export const NATIVE_BUILD_RECIPE = 2;
/** CI pushes each Linux glibc build to GHCR as an OCI artifact tagged with its build key. */
export const PREBUILT_ADDON_REPOSITORY = "useautumn/librdkafka-addon";
