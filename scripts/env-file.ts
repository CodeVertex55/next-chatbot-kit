/** Loads variables from an env file into process.env. A missing file is fine. Existing values win. */
export function loadLocalEnv(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // There is no file. The values may still be set in the environment.
  }
}
