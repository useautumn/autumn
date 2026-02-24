/**
 * Remove all fields marked with internal: true from the OpenAPI spec
 */
export function removeInternalFields({ spec }: { spec: any }) {
  let removedCount = 0;

  function traverseAndRemove(obj: any, parent: any = null, key: string = '') {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // If this is a properties object, check each property for internal flag
    if (key === 'properties' && typeof obj === 'object') {
      const propertiesToRemove: string[] = [];

      for (const propName in obj) {
        if (obj[propName]?.internal === true) {
          propertiesToRemove.push(propName);
        }
      }

      // Remove internal properties
      for (const propName of propertiesToRemove) {
        delete obj[propName];
        removedCount++;

        // Also remove from required array in parent if it exists
        if (parent?.required && Array.isArray(parent.required)) {
          parent.required = parent.required.filter((f: string) => f !== propName);
          if (parent.required.length === 0) {
            delete parent.required;
          }
        }
      }
    }

    // Recurse into all nested objects and arrays
    for (const objKey in obj) {
      if (obj.hasOwnProperty(objKey)) {
        traverseAndRemove(obj[objKey], obj, objKey);
      }
    }
  }

  traverseAndRemove(spec);

  if (removedCount > 0) {
    console.log(`  ✓ Removed ${removedCount} internal field(s)`);
  }

  return spec;
}
