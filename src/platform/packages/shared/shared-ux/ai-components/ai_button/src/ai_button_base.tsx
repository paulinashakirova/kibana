/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { IconType } from '@elastic/eui';
import type { EuiButtonEmptyProps, EuiButtonIconProps } from '@elastic/eui';
import { EuiButton, EuiButtonEmpty, EuiButtonIcon } from '@elastic/eui';

import { useAiButtonGradientStyles, useSvgAiGradient } from './use_ai_gradient_styles';
import { useAiButtonXsSizeCss } from './ai_button_xs_size_styles';
import { SvgAiGradientDefs } from './svg_ai_gradient_defs';
import { AiAssistantLogo } from './ai_assistant_logo';
import type { AiButtonIconType, AiButtonProps, AiButtonVariant } from './types';

/**
 * ## AiButton → EUI Button Type Passthrough: Why This Architecture
 *
 * AiButton delegates to EuiButton, EuiButtonEmpty, or EuiButtonIcon based on props.
 * EUI buttons use `ExclusiveUnion<PropsForAnchor, PropsForButton>` so you pass either
 * link props (href, onClick for anchor) or button props (form, type, onClick for button).
 *
 * ### The Problem
 * 1. **Consumer abstraction**: Callers pass `onClick` and `buttonRef` without knowing
 *    whether the rendered element is `<button>` or `<a>`. A single handler/ref must work
 *    for both, so we type them as `MouseEventHandler<HTMLElement>` and `Ref<HTMLElement>`.
 * 2. **ExclusiveUnion**: EUI expects either anchor props (no `form`, `type`, etc.) or
 *    button props (no `href`, `target`, etc.). Spreading a union that includes both
 *    branches makes TS reject because `form` and `href` are mutually exclusive.
 * 3. **Ref invariance**: `Ref<HTMLElement>` is not assignable to `Ref<HTMLButtonElement>`
 *    or `Ref<HTMLAnchorElement>`—Ref is invariant, even though at runtime both element
 *    types extend HTMLElement and the ref works correctly.
 *
 * ### The Solution (Best Practice)
 * - **Types** (types.ts): `WithElementAgnosticHandlers` only relaxes event handlers and
 *   `buttonRef` to HTMLElement; we preserve `form`, `type`, etc. so they pass through.
 * - **Runtime filter**: `filterForButtonOrAnchor` strips the "other branch" props based
 *   on `href`, satisfying ExclusiveUnion at the call site.
 * - **Narrow assertion**: We assert to the target component's props type (not `any`)
 *   only where TS cannot prove assignability (Ref invariance). The assertion is
 *   necessary and safe: EUI passes the real element into our ref, and both
 *   HTMLButtonElement and HTMLAnchorElement extend HTMLElement.
 */

const resolvedIconType = (iconType: AiButtonIconType): IconType =>
  iconType === 'aiAssistantLogo' ? AiAssistantLogo : iconType;

// Per design: only xs uses small icon; s and m both use medium icon.
const getSyncedIconSize = (size?: 'xs' | 's' | 'm') => (size === 'xs' ? 's' : 'm');

/** Button-only HTML attributes to omit when rendering as anchor. */
const BUTTON_ONLY_KEYS = [
  'form',
  'formAction',
  'formEncType',
  'formMethod',
  'formNoValidate',
  'formTarget',
  'name',
  'type',
  'value',
] as const;
type ButtonOnlyKey = (typeof BUTTON_ONLY_KEYS)[number];
/** Anchor-only HTML attributes to omit when rendering as button. */
const ANCHOR_ONLY_KEYS = ['href', 'target', 'rel', 'download', 'referrerPolicy', 'ping'] as const;
type AnchorOnlyKey = (typeof ANCHOR_ONLY_KEYS)[number];

/**
 * EUI buttons use ExclusiveUnion: anchor props (href) vs button props (form, type, etc.).
 * Filter rest so we pass only the branch that matches `href`, satisfying the union.
 */
function filterForButtonOrAnchor<T extends Record<string, unknown>>(
  rest: T,
  hasHref: true
): Omit<T, ButtonOnlyKey>;
function filterForButtonOrAnchor<T extends Record<string, unknown>>(
  rest: T,
  hasHref: false
): Omit<T, AnchorOnlyKey>;
function filterForButtonOrAnchor<T extends Record<string, unknown>>(
  rest: T,
  hasHref: boolean
): Omit<T, ButtonOnlyKey> | Omit<T, AnchorOnlyKey> {
  if (hasHref) {
    const filtered = { ...rest };
    for (const k of BUTTON_ONLY_KEYS) {
      delete filtered[k];
    }
    return filtered as Omit<T, ButtonOnlyKey>;
  }
  const filtered = { ...rest };
  for (const k of ANCHOR_ONLY_KEYS) {
    delete filtered[k];
  }
  return filtered as Omit<T, AnchorOnlyKey>;
}

export const AiButtonBase = (props: AiButtonProps) => {
  const variant: AiButtonVariant = props.variant ?? 'base';

  const euiButtonXsSizeCss = useAiButtonXsSizeCss();
  const { buttonCss, labelCss } = useAiButtonGradientStyles({
    variant,
    iconOnly: props.iconOnly,
  });
  const { gradientId, iconGradientCss, colors } = useSvgAiGradient({ variant });

  const svgGradientDefs = iconGradientCss ? (
    <SvgAiGradientDefs gradientId={gradientId} colors={colors} />
  ) : null;

  if (props.iconOnly === true) {
    const {
      iconType,
      css: userCss,
      display: _display,
      iconOnly: _iconOnly,
      variant: _variant,
      ...rest
    } = props;

    const iconProps: EuiButtonIconProps = {
      ...rest,
      iconType: resolvedIconType(iconType),
      iconSize: rest.iconSize ?? getSyncedIconSize(rest.size),
      css: [buttonCss, iconGradientCss, userCss],
    };

    return (
      <>
        {svgGradientDefs}
        <EuiButtonIcon {...iconProps} />
      </>
    );
  }

  if (props.variant === 'empty' || props.variant === 'outlined') {
    const {
      variant: _variant,
      iconOnly: _iconOnly,
      children,
      css: userCss,
      iconType,
      ...rest
    } = props;

    const filtered = rest.href
      ? filterForButtonOrAnchor(rest, true)
      : filterForButtonOrAnchor(rest, false);
    const emptyProps = {
      ...filtered,
      iconSize: rest.iconSize ?? getSyncedIconSize(rest.size),
      iconType: iconType ? resolvedIconType(iconType) : undefined,
      css: [buttonCss, iconGradientCss, userCss],
      children: <span css={labelCss}>{children}</span>,
    } as EuiButtonEmptyProps;
    // Type assertion required: Ref<HTMLElement> is runtime-safe (EUI passes <button>|<a>, both extend
    // HTMLElement) but Ref is invariant so TS rejects assignment. See file-level comment.

    return (
      <>
        {svgGradientDefs}
        <EuiButtonEmpty {...emptyProps} />
      </>
    );
  }

  type EuiButtonBranchProps = Extract<AiButtonProps, { variant?: 'base' | 'accent' }>;
  const {
    variant: _variant,
    iconOnly: _iconOnly,
    children,
    css: userCss,
    iconType,
    size,
    ...rest
  } = props as EuiButtonBranchProps;
  const buttonSize: 's' | 'm' | undefined = size === 'xs' ? 's' : size;

  const filtered = rest.href
    ? filterForButtonOrAnchor(rest, true)
    : filterForButtonOrAnchor(rest, false);
  const buttonProps = {
    ...filtered,
    size: buttonSize,
    iconSize: rest.iconSize ?? getSyncedIconSize(size),
    iconType: iconType ? resolvedIconType(iconType) : undefined,
    css: [buttonCss, iconGradientCss, size === 'xs' && euiButtonXsSizeCss, userCss],
    fill: variant === 'accent',
    children: <span css={labelCss}>{children}</span>,
  } as React.ComponentProps<typeof EuiButton>;
  // Type assertion required: Ref<HTMLElement> is runtime-safe (EUI passes <button>|<a>, both extend
  // HTMLElement) but Ref is invariant so TS rejects assignment. See file-level comment.

  return (
    <>
      {svgGradientDefs}
      <EuiButton {...buttonProps} />
    </>
  );
};
