/**
 * 余额正无穷 · Infinite Balance — Host half.
 *
 * One rule, stated once: a balance above the configured threshold is presented
 * as positive infinity instead of its real number. This half owns that rule as a
 * model-facing Tool, so the Agent reports the same value the UI shows; the
 * Client half (`./client`) renders it below the composer card.
 *
 * Deliberately dependency-free: a third-party bundle is installed from GitHub or
 * npm, so it must not import any `@deepseek-ai/*` package and stays loadable
 * across DSH releases.
 *
 * When other plugins display the balance (`dsh-whale-widget` today, any target in
 * `./balance-patches.js` tomorrow), this half keeps those displays at ∞ too. Such a plugin
 * formats the number in its own code with no seat another plugin can occupy, so the rule is
 * carried by a declared, anchor-checked patch that this plugin re-asserts on every mount.
 *
 * @module dsh-plugin-infinite-balance
 */

import { applyBalancePatches } from './balance-patches.js'

/** Cordis plugin name, used in Loader diagnostics. */
export const name = 'infinite-balance'

/** The Tool registry must exist before this row activates. */
export const inject = ['tools']

/** 高于这个金额就算正无穷。Above this amount a balance counts as infinite. */
const DEFAULT_THRESHOLD = 10

/** Wallet currency used when the caller names none. */
const DEFAULT_CURRENCY = 'CNY'

/** Currency symbols for the rendered text. */
const SYMBOLS = { CNY: '¥', USD: '$' }

/** Feeds the Platform `x-client-version` request header; informational only. */
const DEFAULT_CLIENT_VERSION = '0.2.0-rc.2'

/** Platform wire locale for the account read. */
const DEFAULT_LOCALE = 'zh'

/** 别的插件也在显示余额时,顺带维护它们的 ∞ 适配。Keep other balance displays at ∞ too. */
const DEFAULT_ADAPTERS = true

/**
 * Read one row option, treating `undefined` and `null` as absent.
 * @param config - the row's `config` object, possibly absent.
 * @param key - option name.
 * @param fallback - value used when the option is absent.
 * @returns the configured value or the fallback.
 */
function optionOf(config, key, fallback) {
  const value = config === undefined || config === null ? undefined : config[key]
  return value === undefined || value === null ? fallback : value
}

/**
 * Read one numeric row option.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - value used when the option is absent or not a finite number.
 * @returns the configured number or the fallback.
 */
function numberOption(config, key, fallback) {
  const value = Number(optionOf(config, key, fallback))
  return Number.isFinite(value) ? value : fallback
}

/**
 * Read one non-empty string row option.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - value used when the option is absent or blank.
 * @returns the configured string or the fallback.
 */
function stringOption(config, key, fallback) {
  const value = optionOf(config, key, fallback)
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/**
 * Read one boolean row option.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - value used when the option is absent or not a boolean.
 * @returns the configured boolean or the fallback.
 */
function booleanOption(config, key, fallback) {
  const value = optionOf(config, key, fallback)
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Report one line through the platform logging service. Logging must never be the
 * reason a mount fails, so every shape is attempted best-effort and then given up.
 * @param ctx - the plugin's Cordis context.
 * @param level - `info` or `warn`.
 * @param message - already-formatted line; `%` is not used, so no format arguments.
 */
function report(ctx, level, message) {
  try {
    const scoped = typeof ctx.logger === 'function' ? ctx.logger('infinite-balance') : undefined
    const logger = scoped ?? ctx.logger
    const sink = logger?.[level]
    if (typeof sink === 'function') {
      sink.call(logger, message)
      return
    }
  } catch {
    /* fall through to the console below */
  }
  if (level === 'warn') console.warn(`infinite-balance: ${message}`)
}

/**
 * Sum every wallet of one currency: a bonus wallet counts exactly like a
 * recharge wallet, which is how the account page's amount row reads.
 * @param wallets - recharge and bonus wallets from one balance read.
 * @param currency - exact currency to total.
 * @returns the total, or `undefined` when the account holds no such wallet.
 */
function totalOf(wallets, currency) {
  let total = 0
  let found = false
  for (const wallet of wallets) {
    if (wallet === null || typeof wallet !== 'object' || wallet.currency !== currency) continue
    const value = Number(wallet.balance)
    if (!Number.isFinite(value)) continue
    total += value
    found = true
  }
  return found ? total : undefined
}

/**
 * Apply the plugin's one rule to one amount.
 * @param amount - decimal amount, already known to be a number.
 * @param currency - wallet currency.
 * @param threshold - exclusive upper bound of a finite-looking balance.
 * @returns the reportable result, ready to become a Tool return value.
 */
function present(amount, currency, threshold) {
  const symbol = SYMBOLS[currency] ?? ''
  const infinite = !Number.isFinite(amount) || amount > threshold
  return {
    amount: String(amount),
    currency,
    threshold,
    infinite,
    display: infinite ? `${symbol}∞` : `${symbol}${amount}`,
  }
}

/**
 * Register the rule as the `infinite_balance` tool.
 * @param ctx - the plugin's Cordis context.
 * @param config - the Loader row's `config`.
 */
export function apply(ctx, config) {
  const threshold = numberOption(config, 'threshold', DEFAULT_THRESHOLD)
  const defaultCurrency = stringOption(config, 'currency', DEFAULT_CURRENCY)
  const clientVersion = stringOption(config, 'clientVersion', DEFAULT_CLIENT_VERSION)
  const locale = stringOption(config, 'locale', DEFAULT_LOCALE)

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'infinite_balance',
        description:
          'Present a balance the way the Infinite Balance plugin does: any amount above the threshold renders as ∞ instead of its real number. Pass `amount` to convert one value; omit it to read this Harness\'s signed-in DeepSeek account balance, with recharge and bonus wallets of that currency summed.',
        parameters: {
          type: 'object',
          properties: {
            amount: {
              type: 'string',
              description:
                'Decimal balance to convert, such as "12.34". Omit to read the signed-in account instead.',
            },
            currency: {
              type: 'string',
              enum: ['CNY', 'USD'],
              description: `Wallet to read or label. Defaults to ${defaultCurrency}.`,
            },
          },
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              amount: { type: 'string', description: 'The real balance the rule was applied to.' },
              currency: { type: 'string', description: 'Wallet currency of the amount.' },
              threshold: { type: 'number', description: 'Exclusive bound above which the balance is infinite.' },
              infinite: { type: 'boolean', description: 'Whether the balance is presented as ∞.' },
              display: { type: 'string', description: 'The text the plugin shows for this balance.' },
              source: { type: 'string', description: '"argument" for a caller-supplied amount, "account" for a live read.' },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text:
                `${value.currency} ${value.amount} -> ${value.display}` +
                (value.infinite
                  ? ` (above the ${String(value.threshold)} threshold, so it reads as infinity)`
                  : ` (at or below the ${String(value.threshold)} threshold, so it reads as itself)`),
            },
          ],
        },
        async execute(args) {
          const currency =
            typeof args?.currency === 'string' && args.currency.trim() !== ''
              ? args.currency.trim().toUpperCase()
              : defaultCurrency
          const requested = typeof args?.amount === 'string' ? args.amount.trim() : ''
          if (requested !== '') {
            const value = Number(requested)
            if (Number.isNaN(value)) throw new Error(`amount "${requested}" is not a decimal number`)
            return { ...present(value, currency, threshold), source: 'argument' }
          }

          const account = ctx.get('deepseekAccount')
          if (account === undefined) {
            throw new Error(
              'this composition has no account service, so pass `amount` instead of asking for a live read',
            )
          }
          let details
          try {
            details = await account.getBalance({
              version: clientVersion,
              locale,
              timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
            })
          } catch (error) {
            throw new Error(`reading the account balance failed: ${error instanceof Error ? error.message : String(error)}`)
          }
          if (details === undefined || details === null) {
            throw new Error('no signed-in account holds a balance for this Harness')
          }
          if (details.status !== 'ready') {
            throw new Error('the Platform did not return a balance for this account')
          }
          const total = totalOf([...(details.value ?? []), ...(details.bonusWallets ?? [])], currency)
          if (total === undefined) throw new Error(`this account holds no ${currency} wallet`)
          return { ...present(total, currency, threshold), source: 'account' }
        },
      }),
    'infinite-balance: tool',
  )

  // 别的插件也在显示余额时,由插件本体维护它们的 ∞ 适配(幂等、自愈);见 ./balance-patches.js。
  if (booleanOption(config, 'adapters', DEFAULT_ADAPTERS)) {
    for (const result of applyBalancePatches({ threshold })) {
      // 没装、已在位都不值得每次启动刷日志;只有真正改动或失败才说话。
      if (result.action === 'already' || result.action === 'absent') continue
      report(ctx, result.ok ? 'info' : 'warn', result.message)
    }
  }
}
