export function removeInternalFields({ spec }: { spec: any }) {
  let removedCount = 0;

  function traverseAndRemove(obj: any, parent: any = null, key: string = '') {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    if (key === 'properties' && typeof obj === 'object') {
      const propertiesToRemove: string[] = [];

      for (const propName in obj) {
        if (obj[propName]?.internal === true) {
          propertiesToRemove.push(propName);
        }
      }

      for (const propName of propertiesToRemove) {
        delete obj[propName];
        removedCount++;

        if (parent?.required && Array.isArray(parent.required)) {
          parent.required = parent.required.filter((f: string) => f !== propName);
          if (parent.required.length === 0) {
            delete parent.required;
          }
        }
      }
    }

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
