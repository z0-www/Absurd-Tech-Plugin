/**
 * 余额正无穷 · Infinite Balance — Client half.
 *
 * Renders one ambient entry below the composer card: the real balance while it
 * stays at or below the threshold, and `∞` once it goes above it.
 *
 * The balance itself comes from the shipped account Remote
 * (`ctx.remote.account.getBalance`), read through the same Client identity the
 * account settings page uses. This module deliberately imports nothing but
 * `react` from the browser module table: a third-party bundle must not load any
 * `@deepseek-ai/dsh-client-*` package.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-infinite-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 高于这个金额显示为正无穷。Keep in sync with `threshold` in cordis.patch.yml. */
    const THRESHOLD = 10

    /** Wallet the badge reads; falls back to whatever currency the account holds. */
    const CURRENCY = 'CNY'

    /** Feeds the Platform `x-client-version` request header; informational only. */
    const CLIENT_VERSION = '0.2.0-rc.2'

    /** Live reads per mounted session, plus one extra read on tab focus. */
    const REFRESH_MS = 5 * 60 * 1000

    /** Currency symbols for the rendered text. */
    const SYMBOLS = { CNY: '¥', USD: '$' }

    /** Visible text, contributed to the Client locale service. */
    const DICTIONARIES = {
      zh: {
        balance: '余额',
        rule: '余额高于 {threshold} 时显示为正无穷',
      },
      en: {
        balance: 'Balance',
        rule: 'Shown as ∞ whenever the balance is above {threshold}',
      },
    }

    /**
     * Build the request identity for one account read, the same shape the
     * account settings page sends.
     * @param ctx - the plugin's Client context.
     * @returns `{ version, locale, timezoneOffsetSeconds }`.
     */
    function clientMetadata(ctx) {
      return {
        version: CLIENT_VERSION,
        locale: ctx.locale.getSnapshot().active,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }
    }

    /**
     * Total every wallet of every currency the account reported.
     * @param balance - a ready `AccountDetails['balance']` value.
     * @returns a currency-to-total map.
     */
    function walletTotals(balance) {
      const totals = new Map()
      for (const wallet of [...(balance.value ?? []), ...(balance.bonusWallets ?? [])]) {
        if (wallet === null || typeof wallet !== 'object') continue
        if (typeof wallet.currency !== 'string') continue
        const amount = Number(wallet.balance)
        if (!Number.isFinite(amount)) continue
        totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + amount)
      }
      return totals
    }

    /**
     * Subscribe one mounted entry to the account balance.
     * @param ctx - the plugin's Client context.
     * @returns `{ status: 'ready', totals }`, or a non-ready status.
     */
    function useBalance(ctx) {
      const [state, setState] = React.useState({ status: 'loading' })
      React.useEffect(() => {
        let disposed = false
        const read = async () => {
          let next
          try {
            const result = await ctx.remote.account.getBalance(clientMetadata(ctx))
            const balance = result !== null && typeof result === 'object' && result.ok === true ? result.value : undefined
            next =
              balance === undefined || balance === null || balance.status !== 'ready'
                ? { status: 'unavailable' }
                : { status: 'ready', totals: walletTotals(balance) }
          } catch {
            next = { status: 'unavailable' }
          }
          if (!disposed) setState(next)
        }
        const visible = () => document.visibilityState !== 'hidden'
        void read()
        const timer = setInterval(() => {
          if (visible()) void read()
        }, REFRESH_MS)
        const onVisible = () => {
          if (visible()) void read()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          disposed = true
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [ctx])
      return state
    }

    /**
     * Build the entry component for one activation; it closes over the Client
     * context because slot components receive no service seat of their own.
     * @param ctx - the plugin's Client context.
     * @returns the slot component.
     */
    function createInfiniteBalance(ctx) {
      return function InfiniteBalance() {
        const [, force] = React.useReducer((revision) => revision + 1, 0)
        React.useEffect(() => ctx.locale.subscribe(force), [ctx])
        const t = ctx.locale.bind('infinite-balance')
        const state = useBalance(ctx)
        if (state.status !== 'ready') return null

        const currency = state.totals.has(CURRENCY) ? CURRENCY : [...state.totals.keys()][0]
        if (currency === undefined) return null
        const amount = state.totals.get(currency)
        const infinite = amount > THRESHOLD
        const symbol = SYMBOLS[currency] ?? ''
        const rule = t('rule').replace('{threshold}', `${symbol}${String(THRESHOLD)}`)

        return h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: '6px',
              padding: '2px 0 6px',
              fontSize: '12px',
              lineHeight: '18px',
              color: 'var(--dsw-alias-label-secondary)',
            },
          },
          h('span', null, t('balance')),
          h(
            'span',
            {
              title: rule,
              style: infinite
                ? {
                    color: 'var(--dsw-alias-state-success-primary)',
                    fontSize: '14px',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }
                : { color: 'var(--dsw-alias-label-primary)', fontVariantNumeric: 'tabular-nums' },
            },
            infinite ? `${symbol}∞` : `${symbol}${amount.toFixed(2)}`,
          ),
        )
      }
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register('infinite-balance', 'zh', DICTIONARIES.zh),
          'infinite-balance: zh dictionary',
        )
        ctx.effect(
          () => ctx.locale.register('infinite-balance', 'en', DICTIONARIES.en),
          'infinite-balance: en dictionary',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.composer.dock', () =>
              ctx.slots.register(
                { name: 'conversation.composer.dock', id: 'infinite-balance', order: 20 },
                createInfiniteBalance(ctx),
              ),
            ),
          'infinite-balance: composer dock entry',
        )
      },
    }
  },
})
