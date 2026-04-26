import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'
import { getActiveSubscription, getUserStats, type Subscription, type UserStats } from '../api'
import { useT } from '../i18n'
import LangSwitch from '../components/LangSwitch'

const PLAN_NAMES: Record<string, { ru: string; en: string }> = {
  vpn_start:   { ru: 'Старт',      en: 'Starter' },
  vpn_popular: { ru: 'Популярный', en: 'Popular'  },
  vpn_pro:     { ru: 'Про',        en: 'Pro'      },
  vpn_family:  { ru: 'Семейный',   en: 'Family'   },
}

const MINI_PLANS = [
  { key: 'vpn_start',   rub: 180, usd: 2, devs: 1, label_ru: 'Старт',      label_en: 'Starter'  },
  { key: 'vpn_popular', rub: 270, usd: 3, devs: 2, label_ru: 'Популярный', label_en: 'Popular', hit: true },
  { key: 'vpn_pro',     rub: 450, usd: 5, devs: 3, label_ru: 'Про',        label_en: 'Pro'      },
]

function ExpiryRing({ days }: { days: number }) {
  const max   = 30
  const pct   = Math.min(1, days / max)
  const r     = 22
  const circ  = 2 * Math.PI * r
  const color = days <= 5 ? '#ff3b30' : days <= 10 ? '#e67e22' : '#27ae60'
  return (
    <svg width={56} height={56} style={{ flexShrink: 0 }}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth={4} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 28 28)" />
      <text x={28} y={33} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>{days}</text>
    </svg>
  )
}

function AppLogo() {
  return (
    <img
      src="/logo.png"
      alt="MAX"
      style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, objectFit: 'cover' }}
    />
  )
}

function RefBanner({ isEn, onPress }: { isEn: boolean; onPress: () => void }) {
  const tp = WebApp.themeParams
  return (
    <div className="fade-in" onClick={onPress} style={{
      background: 'var(--section-bg)',
      borderRadius: 16,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer',
      border: '1.5px solid rgba(230,126,34,0.2)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        background: '#e67e22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M20 12v10H4V12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 7H2v5h20V7z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 22V7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tp.text_color, marginBottom: 2 }}>
          {isEn ? 'Invite a friend' : 'Пригласи друга'}
        </div>
        <div style={{ fontSize: 12, color: tp.hint_color }}>
          {isEn ? 'Get +7 days free for each friend' : 'Получи +7 дней за каждого друга'}
        </div>
      </div>
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
        <path d="M1 1l5 5-5 5" stroke="rgba(128,128,128,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function HowItWorks({ isEn }: { isEn: boolean }) {
  const tp = WebApp.themeParams
  const steps = isEn ? [
    { num: '1', color: '#2481cc', title: 'Choose a plan',     sub: 'From $2/month, cancel anytime' },
    { num: '2', color: '#27ae60', title: 'Download config',   sub: 'Get your WireGuard profile in the bot' },
    { num: '3', color: '#8e44ad', title: 'Connect in Amnezia', sub: 'Import the file and tap Connect' },
  ] : [
    { num: '1', color: '#2481cc', title: 'Выбери тариф',      sub: 'От 180 ₽/мес, можно отменить в любой момент' },
    { num: '2', color: '#27ae60', title: 'Скачай конфиг',     sub: 'Получи WireGuard профиль прямо в боте' },
    { num: '3', color: '#8e44ad', title: 'Подключись в Amnezia', sub: 'Импортируй файл и нажми Подключиться' },
  ]
  return (
    <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
      {steps.map(({ num, color, title, sub }, i) => (
        <div key={i} style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: i < steps.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: '#fff',
          }}>{num}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: tp.text_color, lineHeight: 1.3 }}>{title}</div>
            <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>{sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const nav    = useNavigate()
  const tp     = WebApp.themeParams
  const t      = useT()
  const accent = 'var(--tg-theme-button-color, #2481cc)'
  const isEn   = t('nav_home') === 'Home'

  const [sub,   setSub]   = useState<Subscription | null | undefined>(undefined)
  const [stats, setStats] = useState<UserStats | null>(null)

  useEffect(() => {
    getActiveSubscription().catch(() => null).then(setSub)
    getUserStats().catch(() => null).then(s => setStats(s))
  }, [])

  const planName = (key: string) => {
    const e = PLAN_NAMES[key]
    return e ? (isEn ? e.en : e.ru) : key
  }

  const hasStats = stats && (stats.stars_spent > 0 || stats.bonus_days > 0 || stats.invited > 0)

  return (
    <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)', gap: 8 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppLogo />
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: tp.text_color, letterSpacing: -0.5 }}>
              MAX
            </div>
            <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>
              {isEn ? 'VPN & eSIM · no censorship' : 'VPN & eSIM · без цензуры'}
            </div>
          </div>
        </div>
        <LangSwitch />
      </div>

      {/* ── ЕСЛИ ЕСТЬ ПОДПИСКА ──────────────────────────────────── */}
      {sub === undefined ? (
        <>
          <div className="skeleton" style={{ height: 88, borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 188, borderRadius: 16 }} />
        </>
      ) : sub ? (
        <>
          {/* Статус подписки */}
          <div className="fade-in" style={{
            borderRadius: 18,
            background: sub.days_remaining <= 5
              ? 'rgba(255,59,48,0.08)'
              : sub.days_remaining <= 10
                ? 'rgba(230,126,34,0.08)'
                : 'rgba(39,174,96,0.08)',
            border: `1.5px solid ${sub.days_remaining <= 5 ? 'rgba(255,59,48,0.25)' : sub.days_remaining <= 10 ? 'rgba(230,126,34,0.25)' : 'rgba(39,174,96,0.2)'}`,
            padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <ExpiryRing days={sub.days_remaining} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#27ae60', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                {t('home_sub_active')}
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, color: tp.text_color }}>
                {planName(sub.plan)}
              </div>
              <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>
                {isEn ? `${sub.days_remaining} days left` : `Осталось ${sub.days_remaining} ${t('day')}`}
              </div>
            </div>
            <button onClick={() => nav('/vpn')} style={{
              padding: '8px 14px', borderRadius: 12, border: 'none',
              background: accent, color: tp.button_text_color ?? '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}>
              {t('home_btn_manage')}
            </button>
          </div>

          {/* Быстрые действия */}
          <div className="fade-in" style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
            {[
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="#fff" strokeWidth="2"/><path d="M9 12h6M9 16h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
                color: '#27ae60',
                title: isEn ? 'My Configs' : 'Мои конфиги',
                sub: isEn ? 'WireGuard profiles' : 'Профили WireGuard',
                action: () => nav('/configs'),
              },
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                color: accent,
                title: isEn ? 'Change Plan' : 'Сменить тариф',
                sub: isEn ? 'Upgrade or downgrade' : 'Улучшить или понизить',
                action: () => nav('/vpn/plans'),
              },
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z" stroke="#fff" strokeWidth="2"/><path d="M12 8v4l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>,
                color: '#8e44ad',
                title: isEn ? 'Setup Guide' : 'Инструкция',
                sub: isEn ? 'How to connect' : 'Как подключиться',
                action: () => nav('/instructions'),
              },
            ].map(({ icon, color, title, sub: subtitle, action }, i, arr) => (
              <button key={title}
                onClick={() => { WebApp.HapticFeedback.impactOccurred('light'); action() }}
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  padding: '13px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                  borderBottom: i < arr.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: tp.text_color, lineHeight: 1.3 }}>{title}</div>
                  <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>{subtitle}</div>
                </div>
                <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="rgba(128,128,128,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            ))}
          </div>

          {/* Статистика */}
          {hasStats && (
            <div className="fade-in">
              <span className="section-title">{t('home_balance')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                {[
                  { value: `${stats!.stars_spent} ⭐`, label: t('home_stars_spent'), show: stats!.stars_spent > 0 },
                  { value: `+${stats!.bonus_days}`,    label: t('home_bonus_days'),  show: stats!.bonus_days > 0  },
                  { value: `${stats!.invited}`,         label: t('home_invited'),     show: stats!.invited > 0     },
                ].filter(x => x.show).map(({ value, label }) => (
                  <div key={label} style={{ background: 'var(--section-bg)', borderRadius: 14, padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: tp.text_color }}>{value}</div>
                    <div style={{ fontSize: 10, color: tp.hint_color, marginTop: 3, lineHeight: 1.3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Реферальный баннер */}
          <RefBanner isEn={isEn} onPress={() => { WebApp.HapticFeedback.impactOccurred('light'); nav('/referral') }} />
        </>
      ) : (
        <>
          {/* ── НЕТ ПОДПИСКИ ───────────────────────────────────────── */}
          <div className="fade-in" style={{
            borderRadius: 16, background: 'var(--section-bg)',
            border: '1.5px solid rgba(128,128,128,0.1)',
            padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: tp.text_color }}>{t('home_sub_none')}</div>
              <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 2 }}>{t('home_sub_from')}</div>
            </div>
            <button onClick={() => nav('/vpn/plans')} style={{
              padding: '9px 18px', borderRadius: 12, border: 'none',
              background: accent, color: tp.button_text_color ?? '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {t('home_btn_buy')}
            </button>
          </div>

          {/* Тарифы */}
          <span className="section-title">{isEn ? 'Choose a plan' : 'Выбери тариф'}</span>
          <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
            {MINI_PLANS.map((p, i) => {
              const label = isEn ? p.label_en : p.label_ru
              const devWord = isEn
                ? `${p.devs} device${p.devs > 1 ? 's' : ''}`
                : `${p.devs} ${p.devs === 1 ? 'устройство' : 'устройства'}`
              return (
                <div key={p.key} className={`fade-in fade-in-${i + 2}`}
                  onClick={() => { WebApp.HapticFeedback.impactOccurred('light'); nav('/vpn/plans') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', cursor: 'pointer',
                    background: p.hit ? `${accent}10` : 'transparent',
                    borderBottom: i < MINI_PLANS.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
                  }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: tp.text_color }}>{label}</span>
                      {p.hit && (
                        <span style={{ background: accent, color: tp.button_text_color ?? '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>
                          {isEn ? 'Popular' : 'Хит'}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: tp.hint_color }}>📱 {devWord}</span>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: tp.text_color }}>{isEn ? `$${p.usd}` : `${p.rub} ₽`}</span>
                    <span style={{ fontSize: 12, color: tp.hint_color }}>{isEn ? '/ mo' : '/ мес'}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Как это работает */}
          <span className="section-title">{isEn ? 'How it works' : 'Как это работает'}</span>
          <HowItWorks isEn={isEn} />

          {/* Реферальный баннер */}
          <RefBanner isEn={isEn} onPress={() => { WebApp.HapticFeedback.impactOccurred('light'); nav('/referral') }} />
        </>
      )}

    </div>
  )
}
