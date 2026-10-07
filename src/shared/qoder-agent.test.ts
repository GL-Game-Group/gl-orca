import { describe, expect, it } from 'vitest'
import { tuiAgentToAgentKind } from './agent-kind'
import {
  isExpectedAgentProcess,
  recognizeAgentProcess,
  recognizeAgentProcessFromCommandLine
} from './agent-process-recognition'
import { getTuiAgentDetectCommands, TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from './tui-agent-detection-commands'
import { TUI_AGENT_DISPLAY_NAMES } from './tui-agent-display-names'
import { resolveTuiAgentLaunchArgs } from './tui-agent-launch-defaults'
import { TUI_AGENT_AUTO_PICK_ORDER, pickTuiAgent } from './tui-agent-selection'
import { buildAgentStartupPlan } from './tui-agent-startup'

describe('Qoder CLI agent', () => {
  it('is detected as `qodercli` or the installer’s `qoder` dispatcher', () => {
    expect(getTuiAgentDetectCommands(TUI_AGENT_CONFIG.qoder)).toEqual(['qodercli', 'qoder'])
    for (const found of ['qodercli', 'qoder']) {
      expect(
        resolveDetectedTuiAgentIds(KNOWN_TUI_AGENT_DETECTION_COMMANDS, new Set([found]), 'darwin')
      ).toEqual(['qoder'])
    }
  })

  it('has its display name, telemetry kind and a place in the auto-pick order', () => {
    expect(TUI_AGENT_DISPLAY_NAMES.qoder).toBe('Qoder')
    expect(tuiAgentToAgentKind('qoder')).toBe('qoder')
    expect(TUI_AGENT_AUTO_PICK_ORDER).toContain('qoder')
    expect(pickTuiAgent(null, ['qoder'], ['qoder'])).toBeNull()
  })

  it('launches `qodercli` with the prompt as --prompt-interactive, never as a positional', () => {
    // Why: Commander dispatches a positional `login`/`update`/`commit` as a subcommand, even after `--`.
    const plan = buildAgentStartupPlan({
      agent: 'qoder',
      prompt: 'say hi',
      cmdOverrides: {},
      platform: 'darwin',
      agentArgs: resolveTuiAgentLaunchArgs('qoder', {})
    })
    expect(plan).toMatchObject({
      agent: 'qoder',
      launchCommand: "qodercli '--dangerously-skip-permissions' --prompt-interactive 'say hi'",
      expectedProcess: 'qodercli',
      followupPrompt: null
    })
    const manual = buildAgentStartupPlan({
      agent: 'qoder',
      prompt: 'update',
      cmdOverrides: {},
      platform: 'linux',
      agentArgs: resolveTuiAgentLaunchArgs('qoder', { qoder: '' })
    })
    expect(manual?.launchCommand).toBe("qodercli --prompt-interactive 'update'")
  })

  it('recognizes the versioned binary macOS reports, the plain name and the npm script', () => {
    const qoder = { agent: 'qoder', processName: 'qodercli' }
    expect(recognizeAgentProcess('qodercli')).toEqual(qoder)
    expect(recognizeAgentProcess('qodercli.exe')).toEqual(qoder)
    expect(recognizeAgentProcess('qoder')).toEqual({ agent: 'qoder', processName: 'qoder' })
    expect(recognizeAgentProcess('qodercli-1.1.65')).toEqual({
      agent: 'qoder',
      processName: 'qodercli-1.1.65'
    })
    expect(
      recognizeAgentProcessFromCommandLine(
        '/Users/dev/.qoder/bin/qodercli/qodercli-1.1.65 --prompt-interactive hi'
      )?.agent
    ).toBe('qoder')
    expect(
      recognizeAgentProcessFromCommandLine(
        'node /usr/lib/node_modules/@qoder-ai/qodercli/bundle/qodercli.js'
      )?.agent
    ).toBe('qoder')
    expect(recognizeAgentProcess('qodercli-ripgrep')).toBeNull()
  })

  it('treats the versioned binary as the expected foreground process', () => {
    expect(isExpectedAgentProcess('qodercli-1.1.65', 'qodercli')).toBe(true)
    expect(isExpectedAgentProcess('qodercli', 'qodercli')).toBe(true)
    expect(isExpectedAgentProcess('qodercli-ripgrep', 'qodercli')).toBe(false)
  })
})
