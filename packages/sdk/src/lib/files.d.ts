/**
 * Consumes a stream and returns a concatenated array buffer. Useful in
 * situations where we need to read the whole file because it forms part of a
 * larger payload containing other fields, and we can't modify the underlying
 * request structure.
 */
export declare function readableStreamToArrayBuffer(readable: ReadableStream<Uint8Array>): Promise<ArrayBuffer>;
/**
 * Determines the MIME content type based on a file's extension.
 * Returns null if the extension is not recognized.
 */
export declare function getContentTypeFromFileName(fileName: string): string | null;
/**
 * Creates a Blob from file content with the given MIME type.
 *
 * Node.js Buffers are Uint8Array subclasses that may share a pooled
 * ArrayBuffer (byteOffset > 0, byteLength < buffer.byteLength). Passing
 * such a Buffer directly to `new Blob([buf])` can include the entire
 * underlying pool on some runtimes, producing a Blob with extra bytes
 * that corrupts multipart uploads.
 *
 * Copying into a standalone Uint8Array ensures the Blob receives only the
 * intended bytes regardless of runtime behaviour.
 */
export declare function bytesToBlob(content: Uint8Array<ArrayBufferLike> | ArrayBuffer | Blob | string, contentType: string): Blob;
