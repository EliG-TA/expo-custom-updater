import { useRef, useEffect } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'

const updater = {
  logs: [],
  lastTimeCheck: 0,
  showDebugInConsole: false,
  default_min_refresh_interval: 300
}

const log = (message) => {
  updater.logs.push(message)
  updater.showDebugInConsole && console.log(message)
}

const getUnixEpoch = () => Math.floor(Date.now() / 1000)

export const getUpdateLogs = () => updater.logs

let isUpdating = false;

export const doUpdateIfAvailable = async ({ beforeDownloadCallback, throwUpdateErrors, force } = {}) => {
  // Prevent multiple simultaneous update checks
  if (isUpdating) {
    log('doUpdateIfAvailable: Update already in progress, skipping');
    return false;
  }
  
  try {
    isUpdating = true;
    updater.lastTimeCheck = getUnixEpoch();
    
    if (__DEV__) {
      log('doUpdateIfAvailable: Unable to update or check for updates in DEV');
      return false;
    }

    log('doUpdateIfAvailable: Checking for updates...');
    const { isAvailable } = await Updates.checkForUpdateAsync();
    log(`doUpdateIfAvailable: Update available? ${isAvailable}`);
    
    if (!isAvailable && !force) return false;
    
    log('doUpdateIfAvailable: Fetching Update');
    beforeDownloadCallback && beforeDownloadCallback();
    await Updates.fetchUpdateAsync();
    log('updateApp: Update fetched, reloading...');
    await Updates.reloadAsync();
  } catch (e) {
    log(`doUpdateIfAvailable: ERROR: ${e.message}`);
    if (throwUpdateErrors) throw e;
    return false;
  } finally {
    isUpdating = false;
  }
};

export const useCustomUpdater = ({
  updateOnStartup = true,
  minRefreshSeconds = updater.default_min_refresh_interval,
  showDebugInConsole = false,
  beforeCheckCallback = null,
  beforeDownloadCallback = null,
  afterCheckCallback = null,
  throwUpdateErrors = false
} = {}) => {
  const appState = useRef(AppState.currentState);
  const isInitialMount = useRef(true);
  updater.showDebugInConsole = showDebugInConsole;

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (updateOnStartup && isInitialMount.current) {
        isInitialMount.current = false;
        try {
          // Add startup flag to prevent infinite loop
          const result = await doUpdateIfAvailable({ 
            beforeDownloadCallback, 
            throwUpdateErrors,
            isStartup: true 
          });
          if (mounted && result === false) {
            // Only set up app state listener if update wasn't applied
            const subscription = AppState.addEventListener('change', _handleAppStateChange);
            return () => {
              mounted = false;
              subscription.remove();
            };
          }
        } catch (err) {
          log(`Init error: ${err.message}`);
          // Continue with app initialization even if update fails
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const _handleAppStateChange = async (nextAppState) => {
    const isBackToApp = appState.current.match(/inactive|background/) && nextAppState === 'active';
    const isTimeToCheck = (getUnixEpoch() - updater.lastTimeCheck) > minRefreshSeconds;
    appState.current = nextAppState;

    log(`appStateChangeHandler: AppState: ${appState.current}, NeedToCheckForUpdate? ${isBackToApp && isTimeToCheck}`);
    
    if (!isTimeToCheck || !isBackToApp) {
      isBackToApp && !isTimeToCheck && log('appStateChangeHandler: Skip check, within refresh time');
      return false;
    }

    beforeCheckCallback && beforeCheckCallback();
    await doUpdateIfAvailable({ beforeDownloadCallback, throwUpdateErrors });
    afterCheckCallback && afterCheckCallback();
  };
};

const UPDATE_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  RELOADING: 'reloading',
  ERROR: 'error'
};

let currentUpdateStatus = UPDATE_STATUS.IDLE;
export const getUpdateStatus = () => currentUpdateStatus;
