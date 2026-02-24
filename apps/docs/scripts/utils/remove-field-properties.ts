/**
 * Remove specific properties from fields in the OpenAPI spec
 * Config format: { 'METHOD /path': { 'fieldName': ['property1', 'property2'] } }
 * Example: { 'POST /products': { 'group': ['default'] } }
 */
export function removeFieldProperties({
  spec,
  removals
}: {
  spec: any;
  removals: Record<string, Record<string, string[]>>;
}) {
  if (!spec.paths) {
    return spec;
  }

  for (const [endpointKey, fieldRemovals] of Object.entries(removals)) {
    // Parse endpoint key: "METHOD /path"
    const [method, ...pathParts] = endpointKey.split(' ');
    const path = pathParts.join(' ');
    const lowerMethod = method.toLowerCase();

    const pathObj = spec.paths[path];
    if (!pathObj) {
      console.warn(`  ⚠ Path "${path}" not found`);
      continue;
    }

    const operation = pathObj[lowerMethod];
    if (!operation) {
      console.warn(`  ⚠ Method "${method}" not found for path "${path}"`);
      continue;
    }

    // Navigate to request body schema properties
    const schema = operation.requestBody?.content?.['application/json']?.schema;
    if (!schema?.properties) {
      console.warn(`  ⚠ No schema properties found for ${method} ${path}`);
      continue;
    }

    // Remove specified properties from each field
    for (const [fieldName, propertiesToRemove] of Object.entries(fieldRemovals)) {
      const field = schema.properties[fieldName];
      if (!field) {
        console.warn(`  ⚠ Field "${fieldName}" not found in ${method} ${path}`);
        continue;
      }

      for (const prop of propertiesToRemove) {
        if (prop in field) {
          delete field[prop];
          console.log(`  ✓ Removed "${prop}" from "${fieldName}" in ${method} ${path}`);
        }
      }
    }
  }

  return spec;
}
