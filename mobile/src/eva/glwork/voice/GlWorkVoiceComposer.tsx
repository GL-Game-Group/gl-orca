import { useEffect, useState, type ComponentProps } from 'react'
import type { TextInput } from 'react-native'
import { MobileNativeChatComposer } from '../../../session/MobileNativeChatComposer'
import { GlWorkVoiceBar } from './GlWorkVoiceBar'
import { draftWithHeard } from './glwork-hold-to-talk-gesture'

type Props = ComponentProps<typeof MobileNativeChatComposer>

function focusField(ref: React.Ref<TextInput> | undefined): void {
  if (ref && typeof ref === 'object' && 'current' in ref) {
    ref.current?.focus()
  }
}

/**
 * Voice mode (docs/fork/changes/glwork-voice.md): the hold-to-talk bar; slid right, Orca's composer
 * holds what was heard for editing until that draft is sent, then the bar comes back.
 */
export default function GlWorkVoiceComposer(props: Props) {
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)

  // Orca's composer mounts for the edit; raise the keyboard once it has.
  useEffect(() => {
    if (!editing) {
      return
    }
    const timer = setTimeout(() => focusField(props.inputRef), 50)
    return () => clearTimeout(timer)
  }, [editing, props.inputRef])

  if (editing) {
    return (
      <MobileNativeChatComposer
        {...props}
        onSend={async (text) => {
          const accepted = await props.onSend(text)
          if (accepted) {
            setEditing(false)
          }
          return accepted
        }}
      />
    )
  }

  const edit = (text: string): void => {
    props.onChangeText(text)
    setEditing(true)
  }

  return (
    <GlWorkVoiceBar
      onAttachImage={props.onAttachImage}
      attachmentCount={props.attachments?.length ?? 0}
      isAttaching={props.isAttaching ?? false}
      sessionOptions={props.sessionOptions}
      sending={sending}
      disabled={props.disabled ?? false}
      onEditHeard={(heard) => edit(draftWithHeard(props.value, heard))}
      onSendHeard={(heard) => {
        const text = draftWithHeard(props.value, heard)
        if (props.sendDisabled) {
          edit(text)
          return
        }
        setSending(true)
        void props
          .onSend(text)
          .then((accepted) => {
            if (!accepted) {
              edit(text)
            }
          })
          .finally(() => setSending(false))
      }}
    />
  )
}
