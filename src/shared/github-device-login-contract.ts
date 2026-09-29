// Wire contract for GitHub device-flow sign-in served by a runtime host (see
// src/main/runtime/github-auth/). Shared by the host, the mobile app, and the CLI.
import { z } from 'zod'

export const GITHUB_LOGIN_DEVICE_PATH = '/auth/github/device'
export const GITHUB_LOGIN_POLL_PATH = '/auth/github/poll'

export const githubLoginStartRequestSchema = z.object({
  client: z.enum(['mobile', 'runtime']),
  deviceName: z.string().trim().min(1).max(64)
})
export type GithubLoginStartRequest = z.infer<typeof githubLoginStartRequestSchema>

export const githubLoginPollRequestSchema = z.object({ loginId: z.string().min(1).max(64) })

export const githubLoginStartedSchema = z.object({
  status: z.literal('started'),
  loginId: z.string().min(1).max(64),
  userCode: z.string().min(1).max(64),
  verificationUri: z.string().url(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive()
})
export type GithubLoginStarted = z.infer<typeof githubLoginStartedSchema>

const failureSchema = z.object({ status: z.literal('error'), reason: z.string() })

export const githubLoginStartResponseSchema = z.discriminatedUnion('status', [
  githubLoginStartedSchema,
  failureSchema
])

export const githubLoginPollResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), interval: z.number().int().positive() }),
  z.object({
    status: z.literal('paired'),
    pairingUrl: z.string().min(1),
    githubLogin: z.string().min(1)
  }),
  z.object({ status: z.literal('denied') }),
  z.object({ status: z.literal('expired') }),
  z.object({ status: z.literal('forbidden'), reason: z.string() }),
  failureSchema
])
export type GithubLoginPollResponse = z.infer<typeof githubLoginPollResponseSchema>
