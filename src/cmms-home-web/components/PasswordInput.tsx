'use client'

import { useState, type ComponentProps, type KeyboardEvent, type MouseEvent } from 'react'

// A password field that warns while Caps Lock is on. Masked input hides the one mistake
// that makes a correct password fail every time — and on /setup it is worse, because the
// wrong-case password is what gets stored.
//
// Browsers only report the lock state on key and mouse events, so it is re-read on each of
// those and cleared on blur: the hint describes the field being typed into, not a field the
// user has left. Soft keyboards generally don't report it at all, so on a phone the hint
// simply never appears — nothing is lost there.
export default function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const { onKeyDown, onKeyUp, onMouseDown, onBlur, ...rest } = props
  const [capsLock, setCapsLock] = useState(false)

  const read = (e: KeyboardEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState('CapsLock'))

  return (
    <>
      <input
        {...rest}
        type="password"
        onKeyDown={e => { read(e); onKeyDown?.(e) }}
        onKeyUp={e => { read(e); onKeyUp?.(e) }}
        onMouseDown={e => { read(e); onMouseDown?.(e) }}
        onBlur={e => { setCapsLock(false); onBlur?.(e) }}
      />
      {capsLock && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Caps Lock is on.
        </p>
      )}
    </>
  )
}
