// GitHub identity a device was bound to by device-flow sign-in (see github-auth/).
export type DeviceGithubIdentity = {
  userId: number
  login: string
  boundAt: number
}

export function parseDeviceGithubIdentity(value: unknown): DeviceGithubIdentity | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('userId' in value) ||
    !('login' in value) ||
    !('boundAt' in value)
  ) {
    return undefined
  }
  const { userId, login, boundAt } = value
  return typeof userId === 'number' &&
    Number.isInteger(userId) &&
    typeof login === 'string' &&
    login.length > 0 &&
    typeof boundAt === 'number'
    ? { userId, login, boundAt }
    : undefined
}
