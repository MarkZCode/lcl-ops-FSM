'use client'

// Hours/minutes duration picker: three squircle segments that separate on
// edit, with the pen icon morphing into a tick.
//
// Ported by hand like AnimatedCounter and Folder — the shadcn CLI can't
// install from that registry here (its manifest asks npm for `cn` and
// `shadcn@latest`, and pulls @base-ui/react, which wants date-fns v4
// against this app's v3). This one genuinely needed four packages:
// @radix-ui/react-slot, figma-squircle, flubber and react-use-measure.
// All four installed cleanly with date-fns left on 3.6.0.
//
// Logic, springs, paths and behaviour are unchanged from the original —
// only the TypeScript is removed to match the codebase.

import { Slot } from '@radix-ui/react-slot'
import { getSvgPath } from 'figma-squircle'
import { interpolate } from 'flubber'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from 'motion/react'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import useMeasure from 'react-use-measure'

import { cn } from '@/lib/utils'

const PEN_PATH = 'M3.78181 16.3092L3 21L7.69086 20.2182C8.50544 20.0825 9.25725 19.6956 9.84119 19.1116L20.4198 8.53288C21.1934 7.75922 21.1934 6.5049 20.4197 5.73126L18.2687 3.58024C17.495 2.80658 16.2406 2.80659 15.4669 3.58027L4.88841 14.159C4.30447 14.7429 3.91757 15.4947 3.78181 16.3092Z'
const TICK_PATH = 'M7.959 20.513L1.592 12.872L3.128 11.592L8.041 17.487L20.947 3.587L22.413 4.948L7.959 20.513Z'

const OPEN_GAP = 8
// Matches --radius-ctl (18px), the radius every other control in this app
// uses. The component shipped with 12, which read as a different control
// set sitting next to the date and time inputs.
const CORNER_RADIUS = 18
// Matches .input's real rendered height: 10px padding top + 20px line +
// 10px padding bottom + 2px border = 42px. The component shipped at h-12
// (48px), which stood proud of every field beside it.
const SEGMENT_H = 42
const GAP_SPRING = { stiffness: 200, damping: 28, mass: 1 }
const ICON_SPRING = { stiffness: 200, damping: 28 }
const WIDTH_SPRING = { stiffness: 250, damping: 31 }
const SWAY_SPRING = { stiffness: 200, damping: 24 }
const ERROR_SPRING = { stiffness: 700, damping: 9 }

const MotionSlot = motion.create(Slot)

const radiusValue = (radius) =>
    typeof radius === 'number' ? radius : radius.get()

const SquircleSegment = ({ asChild, cornerSmoothing = 1, leftRadius, rightRadius, className, style, children }) => {
    const Component = asChild ? MotionSlot : motion.div
    const [ref, bounds] = useMeasure()
    const width = useMotionValue(0)
    const height = useMotionValue(0)

    useEffect(() => {
        width.set(bounds.width)
        height.set(bounds.height)
    }, [bounds.width, bounds.height, width, height])

    // The shape is applied as a MASK, not a clip-path.
    //
    // clip-path clips the hit area as well as the pixels, and this path is
    // rebuilt from an async useMeasure() result while the input's width is
    // still spring-animating — so the clickable region kept ending up
    // offset from what was drawn, and taps landed below the control. A
    // mask paints identically and leaves hit-testing alone, so the squircle
    // corners survive and the segment is clickable where you see it.
    const maskImage = useTransform(() => {
        const w = width.get()
        const h = height.get()
        if (w <= 0 || h <= 0) {
            return 'none'
        }
        const left = radiusValue(leftRadius)
        const right = radiusValue(rightRadius)
        const path = getSvgPath({
            width: w,
            height: h,
            topLeftCornerRadius: left,
            bottomLeftCornerRadius: left,
            topRightCornerRadius: right,
            bottomRightCornerRadius: right,
            cornerSmoothing,
        })
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="#000"/></svg>`
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    })

    return (
        <Component
            data-slot="duration-picker-segment"
            ref={ref}
            className={className}
            style={{
                ...style,
                // `relative` so the measuring span below stays inside this
                // segment instead of escaping onto neighbouring fields.
                position: 'relative',
                maskImage,
                WebkitMaskImage: maskImage,
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
            }}
        >
            {children}
        </Component>
    )
}

const DurationField = ({ value, onValueChange, max, isEditing, shouldReduceMotion, disabled, swayX, inputRef, onRequestEdit }) => {
    const measureRef = useRef(null)
    const [textWidth, setTextWidth] = useState(0)
    const errorX = useSpring(0, ERROR_SPRING)
    const x = useTransform(() => swayX.get() + errorX.get())

    useLayoutEffect(() => {
        if (measureRef.current) {
            setTextWidth(measureRef.current.offsetWidth)
        }
    }, [value])

    const handleChange = (event) => {
        const next = event.target.value
        if (next !== '' && (Number(next) > max || Number(next) < 0)) {
            onValueChange(String(Math.min(max, Math.max(0, Number(next)))))
            if (!shouldReduceMotion) {
                errorX.jump(6)
                errorX.set(0)
            }
            return
        }
        onValueChange(next)
    }

    const collapsedWidth = Math.max(textWidth + 12, 22)

    return (
        <>
            <motion.input
                data-slot="duration-picker-input"
                ref={inputRef}
                type="number"
                value={value}
                onChange={handleChange}
                placeholder={isEditing ? '' : '0'}
                readOnly={!isEditing}
                disabled={disabled}
                onPointerDown={() => { if (!isEditing) onRequestEdit?.() }}
                onFocus={() => { if (!isEditing) onRequestEdit?.() }}
                style={{ x, width: isEditing ? 44 : collapsedWidth, color: 'var(--text-primary)', background: 'transparent' }}
                animate={{ width: isEditing ? 44 : collapsedWidth }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', ...WIDTH_SPRING }}
                className='h-full text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
            />
            {/* pointer-events-none, and the segment above is positioned, so
                this can never sit over another field and swallow its taps. */}
            <span ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre font-semibold">{value || '0'}</span>
        </>
    )
}

const clampField = (raw, max) => Math.min(max, Math.max(0, Math.trunc(raw) || 0))

function DurationPicker({
    value,
    defaultValue,
    onChange,
    onConfirm,
    onEditingChange,
    defaultEditing = false,
    maxHours = 24,
    maxMinutes = 60,
    hoursLabel = 'Hr.',
    minutesLabel = 'Min.',
    disabled = false,
    className,
    ...props
}) {
    const isControlled = value !== undefined
    const [isEditing, setIsEditing] = useState(defaultEditing)
    const [hoursText, setHoursText] = useState(() => fieldText(value ?? defaultValue, 'hours'))
    const [minutesText, setMinutesText] = useState(() => fieldText(value ?? defaultValue, 'minutes'))

    useEffect(() => {
        if (!isControlled) {
            return
        }
        if (clampField(Number(hoursText), maxHours) !== clampField(value.hours, maxHours)) {
            setHoursText(fieldText(value, 'hours'))
        }
        if (clampField(Number(minutesText), maxMinutes) !== clampField(value.minutes, maxMinutes)) {
            setMinutesText(fieldText(value, 'minutes'))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isControlled, value?.hours, value?.minutes, maxHours, maxMinutes])

    const toValue = (hours, minutes) => ({
        hours: clampField(Number(hours), maxHours),
        minutes: clampField(Number(minutes), maxMinutes),
    })

    const handleHoursChange = (text) => {
        setHoursText(text)
        onChange?.(toValue(text, minutesText))
    }

    const handleMinutesChange = (text) => {
        setMinutesText(text)
        onChange?.(toValue(hoursText, text))
    }

    const shouldReduceMotion = useReducedMotion()
    const gap = useSpring(defaultEditing ? OPEN_GAP : 0, GAP_SPRING)
    const openness = (v) => Math.min(OPEN_GAP, Math.max(0, v)) / OPEN_GAP
    const segmentSpacing = useTransform(gap, (v) => `${Math.min(OPEN_GAP, Math.max(0, v)) - (1 - openness(v))}px`)
    const innerRadius = useTransform(gap, (v) => CORNER_RADIUS * openness(v))
    const innerPadRight = useTransform(gap, (v) => `${3 + 9 * openness(v)}px`)
    const innerPadLeft = useTransform(gap, (v) => `${9 * openness(v)}px`)
    const gapVelocity = useVelocity(gap)
    const swayXRaw = useTransform(gapVelocity, [-70, 0, 70], [-3, 0, 3], { clamp: true })
    const swayX = useSpring(swayXRaw, SWAY_SPRING)
    const iconProgress = useSpring(defaultEditing ? 1 : 0, ICON_SPRING)
    const iconPath = useTransform(iconProgress, [0, 1], [PEN_PATH, TICK_PATH], {
        clamp: true,
        mixer: (from, to) => interpolate(from, to, { maxSegmentLength: 1 }),
    })
    const iconStrokeWidth = useTransform(iconProgress, [0, 1], [0, 2.5], { clamp: true })
    const iconStrokeOpacity = useTransform(iconProgress, [0, 1], [0, 1], { clamp: true })
    const iconDashOpacity = useTransform(iconProgress, [0, 0.4], [1, 0], { clamp: true })
    const hoursInputRef = useRef(null)

    const setEditing = (next) => {
        if (disabled) {
            return
        }
        const targetGap = next ? OPEN_GAP : 0
        const targetIcon = next ? 1 : 0
        if (shouldReduceMotion) {
            gap.jump(targetGap)
            iconProgress.jump(targetIcon)
        } else {
            gap.set(targetGap)
            iconProgress.set(targetIcon)
        }
        setIsEditing(next)
        onEditingChange?.(next)
        if (next) {
            hoursInputRef.current?.focus()
        } else {
            onConfirm?.(toValue(hoursText, minutesText))
        }
    }

    const toggleEdit = () => setEditing(!isEditing)
    // Tapping either number opens the picker directly, rather than making
    // you find the pen first — that was the other half of "the keyboard
    // doesn't come up": the inputs are readOnly until editing starts.
    const openEdit = () => { if (!isEditing) setEditing(true) }

    return (
        <motion.div
            data-slot="duration-picker"
            data-editing={isEditing || undefined}
            data-disabled={disabled || undefined}
            className={cn('flex min-w-0 max-w-full flex-row items-center text-card-foreground', disabled && 'opacity-50', className)}
            {...props}
        >
            <SquircleSegment leftRadius={CORNER_RADIUS} rightRadius={innerRadius} style={{ paddingRight: innerPadRight, backgroundColor: "var(--surface-raised)", height: SEGMENT_H }}
                className="flex items-center gap-1 pl-2">
                <DurationField value={hoursText} onValueChange={handleHoursChange} max={maxHours} isEditing={isEditing} shouldReduceMotion={!!shouldReduceMotion} disabled={disabled} swayX={swayX} inputRef={hoursInputRef} onRequestEdit={openEdit} />
                <motion.span style={{ x: swayX, color: 'var(--text-muted)' }} className='shrink-0 text-sm font-semibold'>{hoursLabel}</motion.span>
            </SquircleSegment>
            <SquircleSegment leftRadius={innerRadius} rightRadius={innerRadius} style={{ marginLeft: segmentSpacing, paddingLeft: innerPadLeft, paddingRight: innerPadRight, backgroundColor: "var(--surface-raised)", height: SEGMENT_H }}
                className="flex items-center gap-1">
                <DurationField value={minutesText} onValueChange={handleMinutesChange} max={maxMinutes} isEditing={isEditing} shouldReduceMotion={!!shouldReduceMotion} disabled={disabled} swayX={swayX} onRequestEdit={openEdit} />
                <motion.span style={{ x: swayX, color: 'var(--text-muted)' }} className='shrink-0 text-sm font-medium'>{minutesLabel}</motion.span>
            </SquircleSegment>
            <SquircleSegment asChild leftRadius={innerRadius} rightRadius={CORNER_RADIUS} style={{ marginLeft: segmentSpacing }}>
                <button
                    data-slot="duration-picker-toggle"
                    type="button"
                    onClick={toggleEdit}
                    disabled={disabled}
                    aria-label={isEditing ? 'Save duration' : 'Edit duration'}
                    style={{ backgroundColor: 'var(--surface-raised)', width: SEGMENT_H, height: SEGMENT_H }}
                    className='flex shrink-0 justify-center items-center active:scale-90 transition-transform disabled:active:scale-100'
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
                        <motion.path fill="var(--text-muted)" stroke="var(--text-muted)" strokeWidth={0} strokeLinejoin="round" strokeLinecap="round" style={{ strokeWidth: iconStrokeWidth, strokeOpacity: iconStrokeOpacity }} d={iconPath} />
                        <motion.path d="M14 6L18 10" fill="none" strokeWidth={1.5} strokeLinecap="round" stroke="var(--surface-raised)" style={{ opacity: iconDashOpacity }} />
                    </svg>
                </button>
            </SquircleSegment>
        </motion.div>
    )
}

function fieldText(value, field) {
    const n = value?.[field]
    return n === undefined || n === 0 ? '' : String(n)
}

export { DurationPicker }
export default DurationPicker
