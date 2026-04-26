import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'
import { getESimPackages, createESimInvoice, type ESimPackage } from '../api'

function filterEssential(pkgs: ESimPackage[]): ESimPackage[] {
  if (pkgs.length <= 5) return pkgs

  const byDuration: Record<number, ESimPackage[]> = {}
  for (const p of pkgs) {
    const days = p.durationUnit.toLowerCase().startsWith('day') ? p.duration : p.duration * 30
    if (!byDuration[days]) byDuration[days] = []
    byDuration[days].push(p)
  }

  const preferred = [30, 15, 7, 14, 21]
  let bucket: ESimPackage[] = []
  for (const d of preferred) {
    if (byDuration[d]?.length >= 2) { bucket = byDuration[d]; break }
  }
  if (!bucket.length) {
    bucket = Object.values(byDuration).sort((a, b) => b.length - a.length)[0] ?? pkgs
  }

  bucket.sort((a, b) => a.stars - b.stars)
  if (bucket.length <= 5) return bucket

  const result: ESimPackage[] = []
  const step = (bucket.length - 1) / 4
  for (let i = 0; i < 5; i++) result.push(bucket[Math.round(i * step)])
  return result
}

function popularIndex(pkgs: ESimPackage[]): number {
  return Math.floor(pkgs.length / 2)
}

// price units are 1/10000 USD, markup 1.45x, rate ~90 ₽/$
function priceToRub(price: number): number {
  return Math.round(price / 10_000 * 1.45 * 90)
}

// ── Payment sheet ─────────────────────────────────────────────────────────────

function PaymentSheet({
  pkg, onClose, onPay, paying,
}: {
  pkg: ESimPackage
  onClose: () => void
  onPay: () => void
  paying: boolean
}) {
  const tp     = WebApp.themeParams
  const accent = 'var(--tg-theme-button-color, #2481cc)'
  const isDaily = pkg.dataType === 2
  const durationStr = isDaily
    ? `${pkg.dataLabel}/день`
    : `${pkg.dataLabel} · ${pkg.duration} ${pkg.durationUnit.toLowerCase().startsWith('day') ? 'дн' : 'мес'}`

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101,
        background: tp.bg_color ?? '#fff',
        borderRadius: '20px 20px 0 0',
        padding: '20px 20px calc(env(safe-area-inset-bottom) + 24px)',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(128,128,128,0.3)',
          margin: '-8px auto 18px',
        }} />

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: tp.text_color }}>
            {pkg.dataLabel}
          </div>
          <div style={{ fontSize: 13, color: tp.hint_color, marginTop: 3 }}>
            {durationStr} · {pkg.speed}
          </div>
        </div>

        {/* Method label */}
        <div style={{
          fontSize: 12, fontWeight: 600, color: tp.hint_color,
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
        }}>
          Способ оплаты
        </div>

        {/* Stars row */}
        <div style={{
          background: 'var(--section-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 14, overflow: 'hidden', marginBottom: 20,
        }}>
          <div style={{
            padding: '13px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
            background: `${accent}10`,
          }}>
            <span style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>⭐</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: tp.text_color, fontWeight: 500 }}>Telegram Stars</div>
              <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>≈ {priceToRub(pkg.price)} ₽</div>
            </div>
            <span style={{ fontSize: 13, color: accent, fontWeight: 600 }}>{pkg.stars} ⭐</span>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${accent}`,
              background: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            </div>
          </div>
        </div>

        {/* Pay button */}
        <button
          className="btn"
          disabled={paying}
          style={{ width: '100%', fontSize: 16, padding: '14px 0' }}
          onClick={onPay}
        >
          {paying ? '…' : `Оплатить ${pkg.stars} ⭐ · ≈${priceToRub(pkg.price)} ₽`}
        </button>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ESimCountry() {
  const { code }     = useParams<{ code: string }>()
  const { state }    = useLocation() as { state: { name?: string; ruCompatible?: boolean } | null }
  const countryName  = state?.name ?? code ?? ''
  const ruCompatible = state?.ruCompatible ?? false
  const nav          = useNavigate()
  const tp           = WebApp.themeParams

  const [packages,  setPackages]  = useState<ESimPackage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sheetPkg,  setSheetPkg]  = useState<ESimPackage | null>(null)
  const [paying,    setPaying]    = useState(false)
  const [paid,      setPaid]      = useState(false)
  const [errMsg,    setErrMsg]    = useState('')

  useEffect(() => {
    WebApp.BackButton.show()
    WebApp.BackButton.onClick(() => nav('/esim'))
    return () => { WebApp.BackButton.hide(); WebApp.BackButton.offClick(() => nav('/esim')) }
  }, [nav])

  useEffect(() => {
    if (!code) return
    getESimPackages(code)
      .then(all => setPackages(filterEssential(all)))
      .catch(() => setErrMsg('Не удалось загрузить пакеты'))
      .finally(() => setLoading(false))
  }, [code])

  const handlePay = async () => {
    if (!sheetPkg || paying) return
    setPaying(true)
    setErrMsg('')
    try {
      const { invoice_url } = await createESimInvoice(sheetPkg)
      WebApp.openInvoice(invoice_url, status => {
        setPaying(false)
        setSheetPkg(null)
        if (status === 'paid') { WebApp.HapticFeedback.notificationOccurred('success'); setPaid(true) }
        else if (status !== 'cancelled') setErrMsg('Платёж не прошёл. Попробуй ещё раз.')
      })
    } catch (e) {
      setPaying(false)
      setErrMsg(e instanceof Error ? e.message : 'Ошибка сервера')
    }
  }

  if (paid) {
    return (
      <div className="page">
        <div className="center">
          <div style={{
            width: 72, height: 72, borderRadius: 22, marginBottom: 4,
            background: 'rgba(39,174,96,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: tp.text_color }}>eSIM оформлен!</div>
          <p style={{ color: tp.hint_color, fontSize: 14, lineHeight: 1.6 }}>
            QR-код уже отправлен в бот — открой чат и отсканируй его в настройках телефона.
          </p>
          <button className="btn" style={{ width: '100%' }} onClick={() => setPaid(false)}>Купить ещё</button>
        </div>
      </div>
    )
  }

  const popIdx = popularIndex(packages)
  const accent = 'var(--tg-theme-button-color, #2481cc)'

  return (
    <>
      <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)' }}>

        <div style={{ padding: '6px 4px 2px' }}>
          <div style={{ fontWeight: 800, fontSize: 24, color: tp.text_color, marginBottom: 4 }}>
            {countryName}
          </div>
          <div style={{ fontSize: 13, color: tp.hint_color }}>
            {ruCompatible
              ? '📡 Работает в России — интернет через зарубежного оператора'
              : '✈️ eSIM для поездки — вставляется без замены основной SIM'}
          </div>
        </div>

        {ruCompatible && (
          <div style={{
            background: 'rgba(39,174,96,0.1)', borderRadius: 12,
            padding: '10px 14px', fontSize: 13, color: '#27ae60', lineHeight: 1.5,
          }}>
            Твой телефон будет думать, что ты за границей — поэтому российские блокировки не действуют. Звонки и SMS на основном номере работают как обычно.
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />)}
          </div>
        )}

        {packages.length > 0 && (
          <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
            {packages.map((pkg, i) => {
              const isPopular = i === popIdx
              const isDaily = pkg.dataType === 2
              const durationStr = isDaily
                ? `${pkg.dataLabel}/день`
                : `${pkg.dataLabel} · ${pkg.duration} ${pkg.durationUnit.toLowerCase().startsWith('day') ? 'дн' : 'мес'}`
              return (
                <div key={pkg.packageCode} style={{
                  padding: '13px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: isPopular ? `${accent}08` : 'transparent',
                  borderBottom: i < packages.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                    background: isPopular ? accent : 'rgba(128,128,128,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15.5a9 9 0 1 0-18 0" stroke={isPopular ? '#fff' : 'var(--tg-theme-hint-color,#888)'} strokeWidth="2" strokeLinecap="round"/>
                      <path d="M12 6v6l4 2" stroke={isPopular ? '#fff' : 'var(--tg-theme-hint-color,#888)'} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: tp.text_color }}>{isDaily ? `${pkg.dataLabel}/день` : pkg.dataLabel}</span>
                      {isPopular && (
                        <span style={{
                          background: accent, color: tp.button_text_color ?? '#fff',
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        }}>Хит</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: tp.hint_color }}>{isDaily ? `ежедневно · ${pkg.speed}` : `${durationStr} · ${pkg.speed}`}</div>
                  </div>

                  <button
                    className="btn"
                    style={{ minWidth: 84, fontSize: 13, flexShrink: 0 }}
                    onClick={() => { WebApp.HapticFeedback.impactOccurred('light'); setSheetPkg(pkg) }}
                  >
                    {priceToRub(pkg.price)} ₽
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {!loading && packages.length === 0 && !errMsg && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>😔</div>
            <p style={{ color: tp.hint_color }}>Пакеты для этой страны временно недоступны</p>
          </div>
        )}

        {errMsg && (
          <p style={{ color: 'var(--tg-theme-destructive-text-color,#ff3b30)', textAlign: 'center', fontSize: 14 }}>
            {errMsg}
          </p>
        )}

        {!loading && packages.length > 0 && (
          <div style={{
            background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
            padding: '12px 16px', fontSize: 13, color: tp.hint_color, lineHeight: 1.6,
          }}>
            После оплаты QR-код придёт в бот. Открой <b>Настройки → SIM-карта → Добавить</b> и отсканируй его.
          </div>
        )}
      </div>

      {sheetPkg && (
        <PaymentSheet
          pkg={sheetPkg}
          onClose={() => !paying && setSheetPkg(null)}
          onPay={handlePay}
          paying={paying}
        />
      )}
    </>
  )
}
