import type {
  CanvasImplementation,
  CanvasManifest,
  Framework,
} from "@tui-canvas/protocol";

interface DependencyCheckResult {
  missing: string[];
}

export interface ImplementationResolution {
  implName?: string;
  implementation?: CanvasImplementation;
  warnings: string[];
  missingDependencies: string[];
  error?: string;
}

function isPlaceholder(implementation: CanvasImplementation): boolean {
  return implementation.status === "placeholder";
}

function getRequiredPackages(implementation: CanvasImplementation): string[] {
  if (implementation.framework === "ink") {
    return ["ink", "react"];
  }

  if (implementation.framework === "opentui") {
    const packages = ["@opentui/core"];
    if (implementation.reconciler === "solid") {
      packages.push("@opentui/solid");
    }
    if (implementation.reconciler === "react") {
      packages.push("@opentui/react");
    }
    return packages;
  }

  return [];
}

async function checkDependencies(packages: string[]): Promise<DependencyCheckResult> {
  const missing: string[] = [];

  for (const pkg of packages) {
    try {
      await import(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  return { missing };
}

function findImplementationByFramework(
  manifest: CanvasManifest,
  framework: Framework
): string | undefined {
  return Object.keys(manifest.implementations).find(
    (name) => manifest.implementations[name]?.framework === framework
  );
}

export async function resolveImplementation(
  manifest: CanvasManifest,
  options: {
    implementation?: string;
    framework?: Framework;
  }
): Promise<ImplementationResolution> {
  const warnings: string[] = [];

  let implName = options.implementation;
  if (!implName && options.framework) {
    implName = findImplementationByFramework(manifest, options.framework);
    if (!implName) {
      return {
        warnings,
        missingDependencies: [],
        error: `No implementation for framework: ${options.framework}`,
      };
    }
  }

  if (!implName) {
    implName = manifest.defaultImplementation;
  }

  let implementation = manifest.implementations[implName];
  if (!implementation) {
    return {
      warnings,
      missingDependencies: [],
      error: `Implementation not found: ${implName}`,
    };
  }

  const explicitRequest = Boolean(options.implementation || options.framework);

  if (isPlaceholder(implementation)) {
    if (!explicitRequest) {
      warnings.push(
        `Default implementation "${implName}" is a placeholder. Attempting fallback.`
      );
    } else {
      return {
        implName,
        implementation,
        warnings: [
          `Implementation "${implName}" is a placeholder and not yet available.`,
        ],
        missingDependencies: [],
        error: `Implementation "${implName}" is a placeholder`,
      };
    }
  }

  const initialDeps = getRequiredPackages(implementation);
  const initialCheck = await checkDependencies(initialDeps);

  if (initialCheck.missing.length === 0 && !isPlaceholder(implementation)) {
    return {
      implName,
      implementation,
      warnings,
      missingDependencies: [],
    };
  }

  if (!explicitRequest) {
    for (const candidateName of Object.keys(manifest.implementations)) {
      if (candidateName === implName) continue;
      const candidate = manifest.implementations[candidateName];
      if (!candidate) continue;
      if (isPlaceholder(candidate)) continue;

      const candidateDeps = getRequiredPackages(candidate);
      const candidateCheck = await checkDependencies(candidateDeps);

      if (candidateCheck.missing.length === 0) {
        const reason = isPlaceholder(implementation)
          ? "is a placeholder"
          : `is missing dependencies: ${initialCheck.missing.join(", ")}`;
        warnings.push(
          `Default implementation "${implName}" ${reason}. Using "${candidateName}" instead.`
        );
        return {
          implName: candidateName,
          implementation: candidate,
          warnings,
          missingDependencies: [],
        };
      }
    }
  }

  if (isPlaceholder(implementation)) {
    return {
      implName,
      implementation,
      warnings,
      missingDependencies: [],
      error: `Implementation "${implName}" is a placeholder`,
    };
  }

  warnings.push(
    `Implementation "${implName}" is missing dependencies: ${initialCheck.missing.join(", ")}.`
  );

  return {
    implName,
    implementation,
    warnings,
    missingDependencies: initialCheck.missing,
    error: `Missing dependencies for ${implName}: ${initialCheck.missing.join(", ")}`,
  };
}
