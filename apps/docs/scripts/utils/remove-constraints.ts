export function removeConstraints({
  spec,
  constraints
}: {
  spec: any;
  constraints: string[];
}) {
  let removedCount = 0;

  function traverseAndRemove(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const constraint of constraints) {
      if (constraint in obj) {
        delete obj[constraint];
        removedCount++;
      }
    }

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newPath = path ? `${path}.${key}` : key;
        traverseAndRemove(obj[key], newPath);
      }
    }
  }

  traverseAndRemove(spec);

  if (removedCount > 0) {
    console.log(`  ✓ Removed ${removedCount} constraint(s): ${constraints.join(', ')}`);
  }

  return spec;
}
