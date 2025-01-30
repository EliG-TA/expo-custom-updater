import { useRef, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Global updater configuration object.
 * Maintains state and settings for the update process.
 */
const updater = {
  logs: [],                              // Store update process logs
  lastTimeCheck: 0,                      // Timestamp of last update check
  showDebugInConsole: false,             // Toggle for console debugging
  default_min_refresh_interval: 300      // Minimum seconds between update checks
};

/**
 * Flag to prevent concurrent update operations.
 * Acts as a semaphore for the update process.
 */
let isUpdating = false;

/**
 * Logs update-related messages and optionally prints to console.
 * @param {string} message - The message to log
 */
const log = (message) => {
  updater.logs.push(message);
  updater.showDebugInConsole && console.log(message);
};

/**
 * Gets current Unix timestamp in seconds.
 * @returns {number} Current Unix timestamp
 */
const getUnixEpoch = () => Math.floor(Date.now() / 1000);

/**
 * Retrieves the update process logs.
 * @returns {Array<string>} Array of log messages
 */
export const getUpdateLogs = () => updater.logs;

/**
 * Checks for and applies available updates.
 * Handles the complete update lifecycle from checking to reloading.
 * 
 * @param {Object} options - Update options
 * @param {Function} options.beforeDownloadCallback - Called before download starts
 * @param {boolean} options.throwUpdateErrors - Whether to throw caught errors
 * @param {boolean} options.force - Force update check regardless of availability
 * @param {boolean} options.isStartup - Whether this is a startup check
 * @returns {Promise<boolean>} Success status of the update
 */
export const doUpdateIfAvailable = async ({ 
  beforeDownloadCallback, 
  throwUpdateErrors, 
  force = false,
  isStartup = false 
} = {}) => {
  // Prevent concurrent update operations
  if (isUpdating) {
    log('doUpdateIfAvailable: Update already in progress, skipping');
    return false;
  }
  
  try {
    isUpdating = true;
    updater.lastTimeCheck = getUnixEpoch();
    
    // Skip updates in development environment
    if (__DEV__) {
      log('doUpdateIfAvailable: Unable to update or check for updates in DEV');
      return false;
    }

    // Check for available updates
    log('doUpdateIfAvailable: Checking for updates...');
    const { isAvailable } = await Updates.checkForUpdateAsync();
    log(`doUpdateIfAvailable: Update available? ${isAvailable}`);
    
    // Return if no update available and not forced
    if (!isAvailable && !force) {
      return false;
    }
    
    // Download and apply update
    log('doUpdateIfAvailable: Fetching Update');
    beforeDownloadCallback && beforeDownloadCallback();
    await Updates.fetchUpdateAsync();
    log('updateApp: Update fetched, reloading...');
    await Updates.reloadAsync();
    
    return true;
  } catch (error) {
    log(`doUpdateIfAvailable: ERROR: ${error.message}`);
    if (throwUpdateErrors) {
      throw error;
    }
    return false;
  } finally {
    // Always reset updating flag
    isUpdating = false;
  }
};

/**
 * Custom hook for managing application updates.
 * Handles both startup updates and background-to-foreground update checks.
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.updateOnStartup - Whether to check for updates on app startup
 * @param {number} options.minRefreshSeconds - Minimum seconds between update checks
 * @param {boolean} options.showDebugInConsole - Whether to show debug logs in console
 * @param {Function} options.beforeCheckCallback - Called before update check
 * @param {Function} options.beforeDownloadCallback - Called before update download
 * @param {Function} options.afterCheckCallback - Called after update check
 * @param {boolean} options.throwUpdateErrors - Whether to throw caught errors
 * @param {number} options.maxRetries - Maximum number of update retry attempts
 */
export const useCustomUpdater = ({
  updateOnStartup = true,
  minRefreshSeconds = updater.default_min_refresh_interval,
  showDebugInConsole = false,
  beforeCheckCallback = null,
  beforeDownloadCallback = null,
  afterCheckCallback = null,
  throwUpdateErrors = false,
  maxRetries = 3
} = {}) => {
  // Refs for maintaining state across renders
  const appState = useRef(AppState.currentState);
  const isInitialMount = useRef(true);
  const retryCount = useRef(0);
  const mounted = useRef(true);

  updater.showDebugInConsole = showDebugInConsole;

  useEffect(() => {
    /**
     * Performs update operation with retry logic
     * @returns {Promise<boolean>} Update success status
     */
    const performUpdate = async () => {
      try {
        const result = await doUpdateIfAvailable({ 
          beforeDownloadCallback, 
          throwUpdateErrors,
          isStartup: true 
        });
        return result;
      } catch (error) {
        log(`Update error: ${error.message}`);
        // Retry if under max retry count
        if (retryCount.current < maxRetries) {
          retryCount.current++;
          return performUpdate();
        }
        throw error;
      }
    };

    /**
     * Initializes the update process on startup
     */
    const init = async () => {
      if (updateOnStartup && isInitialMount.current && mounted.current) {
        isInitialMount.current = false;
        try {
          await performUpdate();
        } catch (error) {
          log(`Init error: ${error.message}`);
          // Continue app initialization despite update failure
        }
      }
    };

    init();
    
    // Set up app state change listener
    const subscription = AppState.addEventListener('change', _handleAppStateChange);

    // Cleanup function
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  /**
   * Handles app state changes and triggers update checks when appropriate
   * @param {string} nextAppState - New app state
   */
  const _handleAppStateChange = async (nextAppState) => {
    if (!mounted.current) return;

    // Check if app is coming to foreground
    const isBackToApp = appState.current.match(/inactive|background/) && 
                       nextAppState === 'active';
    // Check if enough time has passed since last update
    const isTimeToCheck = (getUnixEpoch() - updater.lastTimeCheck) > minRefreshSeconds;
    
    appState.current = nextAppState;

    log(`appStateChangeHandler: AppState: ${appState.current}, NeedToCheckForUpdate? ${isBackToApp && isTimeToCheck}`);
    
    // Skip if conditions aren't met
    if (!isTimeToCheck || !isBackToApp) {
      isBackToApp && !isTimeToCheck && 
        log('appStateChangeHandler: Skip check, within refresh time');
      return false;
    }

    try {
      beforeCheckCallback && beforeCheckCallback();
      await doUpdateIfAvailable({ beforeDownloadCallback, throwUpdateErrors });
      afterCheckCallback && afterCheckCallback();
    } catch (error) {
      log(`AppState update error: ${error.message}`);
    }
  };
};
