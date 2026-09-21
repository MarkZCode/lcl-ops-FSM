'use client'

// Hours/minutes duration picker — the segmented pill from the rare-ui
// registry, rebuilt as a plain fill-in box.
//
// The original is kept in git history. It could not survive being a real
// form control, for two structural reasons:
//
//   1. Each segment was shaped with `clip-path: path(...)` from
//      figma-squircle. clip-path clips the HIT AREA as well as the pixels,
//      and that path was generated from an async useMeasure() result while
//      the input's width was spring-animating — so the clickable region sat
//      offset from what was drawn. Taps landed below the control.
//   2. Its hidden text-measuring <span> was position:absolute with no
//      positioned ancestor, so it escaped its segment, floated over the
//      neighbouring fields and swallowed their clicks.
//
// Both are gone here. The corners are border-radius (visually the same at
// this size), the inputs are fixed-width and always editable — no pen/tick
// toggle, no width animation, no measuring span, nothing between the finger
// and the input. A duration gets typed on a phone by someone standing in a
// hallway; it has to just work.
//
// The look is carried over: same segment height as .input (42px), same
// --radius-ctl corners, same --surface-raised fill, same Hr./Min. labels.

import { useId } from 'react'

import { cn } from '@/lib/utils'

// Matches .input's rendered height: 10px pad + 20px line + 10px pad + 2px border.
const SEGMENT_H = 42
// Matches --radius-ctl, the radius every other control in this app uses.
const CORNER_RADIUS = 18
// The seam where the two segments meet stays square, so they read as one pill.
const SEAM_RADIUS = 4

const clampField = (raw, max) => Math.min(max, Math.max(0, Math.trunc(Number(raw) || 0)))

const fieldText = (n) => (!n ? '' : String(n))

function Segment({ id, label, value, onValueChange, max, disabled, radii }) {
    return (
        <label
            htmlFor={id}
            data-slot="duration-picker-segment"
            className="flex min-w-0 flex-1 cursor-text items-center justify-center gap-1 px-2"
            style={{
                height: SEGMENT_H,
                backgroundColor: 'var(--surface-raised)',
                borderTopLeftRadius: radii[0],
                borderBottomLeftRadius: radii[0],
                borderTopRightRadius: radii[1],
                borderBottomRightRadius: radii[1],
            }}
        >
            <input
                id={id}
                data-slot="duration-picker-input"
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                value={value}
                disabled={disabled}
                placeholder="0"
                aria-label={label}
                onChange={(e) => {
                    const next = e.target.value
                    // let the field go empty while typing; only clamp real numbers
                    onValueChange(next === '' ? '' : String(clampField(next, max)))
                }}
                style={{ color: 'var(--text-primary)' }}
                className="w-full min-w-0 bg-transparent text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span
                aria-hidden
                style={{ color: 'var(--text-muted)' }}
                className="shrink-0 text-sm font-semibold"
            >
                {label}
            </span>
        </label>
    )
}

function DurationPicker({
    value,
    onChange,
    maxHours = 12,
    maxMinutes = 59,
    hoursLabel = 'Hr.',
    minutesLabel = 'Min.',
    disabled = false,
    className,
    ...props
}) {
    const uid = useId()
    const hours = clampField(value?.hours, maxHours)
    const minutes = clampField(value?.minutes, maxMinutes)

    // Each field edits only its own half, so typing in one never wipes the other.
    const setHours = (text) => onChange?.({ hours: clampField(text, maxHours), minutes })
    const setMinutes = (text) => onChange?.({ hours, minutes: clampField(text, maxMinutes) })

    return (
        <div
            data-slot="duration-picker"
            data-disabled={disabled || undefined}
            className={cn('flex min-w-0 items-center gap-[2px]', disabled && 'opacity-50', className)}
            {...props}
        >
            <Segment
                id={`${uid}-h`}
                label={hoursLabel}
                value={fieldText(hours)}
                onValueChange={setHours}
                max={maxHours}
                disabled={disabled}
                radii={[CORNER_RADIUS, SEAM_RADIUS]}
            />
            <Segment
                id={`${uid}-m`}
                label={minutesLabel}
                value={fieldText(minutes)}
                onValueChange={setMinutes}
                max={maxMinutes}
                disabled={disabled}
                radii={[SEAM_RADIUS, CORNER_RADIUS]}
            />
        </div>
    )
}

export { DurationPicker }
export default DurationPicker
