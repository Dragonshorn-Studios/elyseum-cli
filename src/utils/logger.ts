export class Logger {
  // Diagnostics go to stderr: stdout is reserved for command output such
  // as the emitted envelope, so `emit-envelope | jq` stays clean.
  static debug(message: string): void {
    console.error(`[DEBUG] ${message}`);
  }

  static info(message: string): void {
    console.error(`[INFO] ${message}`);
  }

  static warn(message: string): void {
    console.error(`[WARN] ${message}`);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, args);
  }
}
