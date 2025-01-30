/**
 * Configuration options for the custom updater
 */
export interface CustomUpdaterOptions {
    /** Whether to check for updates when the app starts */
    updateOnStartup?: boolean;
    /** Minimum seconds between update checks */
    minRefreshSeconds?: number;
    /** Whether to show debug logs in console */
    showDebugInConsole?: boolean;
    /** Called before update check begins */
    beforeCheckCallback?: () => void;
    /** Called before update download begins */
    beforeDownloadCallback?: () => void;
    /** Called after update check completes */
    afterCheckCallback?: () => void;
    /** Whether to throw caught errors */
    throwUpdateErrors?: boolean;
    /** Maximum number of update retry attempts */
    maxRetries?: number;
}

/**
 * Custom hook for managing application updates.
 * Handles both startup updates and background-to-foreground update checks.
 */
export function useCustomUpdater(options?: CustomUpdaterOptions): void;

/**
 * Retrieves the update process logs.
 * @returns Array of log messages
 */
export function getUpdateLogs(): string[];

/**
 * Checks for and applies available updates.
 * Handles the complete update lifecycle from checking to reloading.
 */
export function doUpdateIfAvailable(options: {
    beforeDownloadCallback?: () => void;
    throwUpdateErrors?: boolean;
    force?: boolean;
    isStartup?: boolean;
}): Promise<boolean>;
