export class Logger {
  static debug(message: string): void {
    console.debug(`[DEBUG] ${message}`);
  }

  static info(message: string): void {
    console.info(`[INFO] ${message}`);
  }

  static warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  static error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }
}
