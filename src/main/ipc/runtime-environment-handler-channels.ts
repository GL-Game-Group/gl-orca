import { GITHUB_REMOTE_HOST_LOGIN_CHANNELS } from './runtime-environment-github-login'

export const RUNTIME_ENVIRONMENT_HANDLER_CHANNELS = [
  'runtimeEnvironments:list',
  'runtimeEnvironments:addFromPairingCode',
  'runtimeEnvironments:verifyAndAddFromPairingCode',
  ...GITHUB_REMOTE_HOST_LOGIN_CHANNELS,
  'runtimeEnvironments:resolve',
  'runtimeEnvironments:remove',
  'runtimeEnvironments:disconnect',
  'runtimeEnvironments:connect',
  'runtimeEnvironments:retryControlConnection',
  'runtimeEnvironments:prepareBrowserClientHostPlacement',
  'runtimeEnvironments:getStatus',
  'runtimeEnvironments:getStatusSnapshots',
  'runtimeEnvironments:call',
  'runtimeEnvironments:subscribe',
  'runtimeEnvironments:unsubscribe'
] as const
