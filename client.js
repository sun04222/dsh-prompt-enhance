/**
 * dsh-prompt-enhance 的 Web 客户端：输入框右侧的「增强提示词」按钮。
 *
 * 交互对齐 WorkBuddy 输入框同名按钮：
 *   空闲 → 点击 = 把当前草稿发给 Host 增强，成功后整段替换草稿，并记住原文；
 *   成功后 → 按钮变「恢复原文」，点击还原（草稿被手动改过则自动回到空闲）；
 *   失败 → 按钮变「增强失败」，title 显示原因，再点可重试。
 *
 * 与 Host 的唯一通道是同源 POST /prompt-enhance（见 index.js）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-enhance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/prompt-enhance'
    const SLOT = 'conversation.input.right'
    const NS = 'prompt-enhance'

    const ZH = {
      enhance: '增强',
      enhancing: '增强中…',
      revert: '恢复原文',
      failed: '增强失败',
      empty: '先输入内容再增强',
      hint: '增强提示词：把当前草稿改写成更清晰具体的提示词',
    }
    const EN = {
      enhance: 'Enhance',
      enhancing: 'Enhancing…',
      revert: 'Restore original',
      failed: 'Enhance failed',
      empty: 'Type something first',
      hint: 'Enhance prompt: rewrite the current draft into a clearer, more specific prompt',
    }

    const noInput = (selector) => selector({ draft: '' })

    /** 语言文案：优先走 Client locale；服务缺席时回落中文。 */
    function translator(ctx) {
      const fallback = (key) => ZH[key] ?? key
      try {
        const locale = ctx.get ? ctx.get('locale') : undefined
        locale?.register?.(NS, 'zh', ZH)
        locale?.register?.(NS, 'en', EN)
        const bound = locale?.bind?.(NS)
        if (typeof bound === 'function') {
          return (key) => {
            try {
              const value = bound(key)
              if (typeof value === 'string' && value !== '' && value !== key) return value
            } catch {}
            return fallback(key)
          }
        }
      } catch {}
      return fallback
    }

    function makeEnhanceButton(t) {
      return function EnhanceButton(props) {
        const useInput = typeof props.useInput === 'function' ? props.useInput : noInput
        const draft = useInput((state) => (state && typeof state.draft === 'string' ? state.draft : '')) || ''
        const inputActions = props.inputActions
        const sessionId = props.sessionId

        // idle | running | done | error
        const [phase, setPhase] = useState('idle')
        const [original, setOriginal] = useState('')
        const [enhanced, setEnhanced] = useState('')
        const [error, setError] = useState('')
        const [hover, setHover] = useState(false)
        const controllerRef = useRef(null)

        // 每个会话有独立草稿：切换会话即回到空闲。
        useEffect(() => {
          setPhase('idle')
          setOriginal('')
          setEnhanced('')
          setError('')
        }, [sessionId])

        // 卸载时取消在途请求。
        useEffect(() => () => {
          const controller = controllerRef.current
          if (controller) controller.abort()
        }, [])

        const busy = phase === 'running'
        const canRevert = phase === 'done' && enhanced !== '' && draft === enhanced
        const disabled = busy || (!canRevert && draft.trim() === '')

        const onClick = useCallback(() => {
          if (busy) return
          if (canRevert) {
            if (typeof inputActions?.setDraft === 'function') inputActions.setDraft(original)
            setPhase('idle')
            setError('')
            return
          }
          if (typeof inputActions?.setDraft !== 'function') return
          const text = draft
          const controller = new AbortController()
          controllerRef.current = controller
          setPhase('running')
          setError('')
          fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          })
            .then(async (response) => {
              const data = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
              if (!data || data.success !== true) {
                const failure = new Error((data && data.error) || 'enhance failed')
                failure.code = data && data.code
                throw failure
              }
              inputActions.setDraft(data.text)
              setOriginal(text)
              setEnhanced(data.text)
              setPhase('done')
            })
            .catch((reason) => {
              if (controller.signal.aborted) return
              setError(reason && reason.message ? reason.message : 'enhance failed')
              setPhase('error')
            })
            .finally(() => {
              if (controllerRef.current === controller) controllerRef.current = null
            })
        }, [busy, canRevert, draft, original, inputActions])

        const label = busy ? t('enhancing') : canRevert ? t('revert') : phase === 'error' ? t('failed') : t('enhance')
        const glyph = busy ? '✦' : canRevert ? '↩' : phase === 'error' ? '⚠' : '✦'
        const title = phase === 'error' && error !== ''
          ? error
          : disabled && !busy
            ? t('empty')
            : phase === 'idle'
              ? t('hint')
              : label

        const style = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 9px',
          border: `1px solid ${canRevert ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'}`,
          borderRadius: 999,
          background: hover && !disabled ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
          color: canRevert || (hover && !disabled)
            ? 'var(--dsw-alias-brand-primary)'
            : phase === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-label-secondary)',
          font: 'inherit',
          fontSize: 12,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'background .12s ease, color .12s ease, border-color .12s ease',
        }

        return h(
          'button',
          {
            type: 'button',
            'data-prompt-enhance': phase,
            'aria-label': label,
            'aria-busy': busy ? 'true' : undefined,
            title,
            disabled,
            style,
            onClick,
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
          },
          h('span', { 'aria-hidden': true, style: { fontSize: 12, lineHeight: 1 } }, glyph),
          h('span', null, label),
        )
      }
    }

    function apply(ctx) {
      const t = translator(ctx)
      const EnhanceButton = makeEnhanceButton(t)
      try {
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register({ name: SLOT, id: 'prompt-enhance', order: 20 }, EnhanceButton),
        )
      } catch (error) {
        console.warn('[prompt-enhance] composer button unavailable:', error)
      }
    }

    return { inject: ['slots'], apply }
  },
})
