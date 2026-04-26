import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'
import { getActiveSubscription, getUserConfigs, getVpnStatus, type Subscription, type VpnConfig, type VpnServerStatus } from '../api'
import { useT } from '../i18n'

const PLAN_NAMES: Record<string, string> = {
  vpn_start: 'Старт', vpn_popular: 'Популярный',
  vpn_pro: 'Про', vpn_family: 'Семейный',
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

function ExpiryBar({ daysLeft }: { daysLeft: number }) {
  const total = 30
  const pct   = Math.max(4, Math.min(100, Math.round(daysLeft / total * 100)))
  const color = daysLeft <= 5 ? '#ff3b30' : daysLeft <= 10 ? '#e67e22' : '#27ae60'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#888' }}>Срок подписки</span>
        <span style={{ color, fontWeight: 600 }}>{daysLeft} дн. осталось</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.2)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function SlotDots({ active, total, color }: { active: number; total: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i < active ? color : 'rgba(128,128,128,0.25)',
          transition: 'background 0.2s',
        }} />
      ))}
    </span>
  )
}

function SkeletonPage() {
  return (
    <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)', gap: 12 }}>
      <div style={{ height: 16 }} />
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 56, borderRadius: 12 }} />
      <div className="skeleton" style={{ height: 56, borderRadius: 12 }} />
    </div>
  )
}

export default function VPN() {
  const nav = useNavigate()
  const tp  = WebApp.themeParams
  const t   = useT()

  const [sub,     setSub]     = useState<Subscription | null | undefined>(undefined)
  const [configs, setConfigs] = useState<VpnConfig[] | null>(null)
  const [status,  setStatus]  = useState<VpnServerStatus[] | null>(null)

  useEffect(() => {
    WebApp.BackButton.show()
    const goBack = () => nav('/')
    WebApp.BackButton.onClick(goBack)
    Promise.all([
      getActiveSubscription().catch(() => null),
      getUserConfigs().catch(() => [] as VpnConfig[]),
      getVpnStatus().catch(() => null),
    ]).then(([s, c, st]) => { setSub(s); setConfigs(c as VpnConfig[]); setStatus(st) })
    return () => { WebApp.BackButton.hide(); WebApp.BackButton.offClick(goBack) }
  }, [nav])

  const goConfigs = () => { WebApp.HapticFeedback.impactOccurred('light'); nav('/configs') }
  const goInstr   = () => { WebApp.HapticFeedback.impactOccurred('light'); nav('/instructions') }
  const goPlans   = () => { WebApp.HapticFeedback.impactOccurred('light'); nav('/vpn/plans') }

  if (sub === undefined) return <SkeletonPage />

  if (sub === null) {
    return (
      <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)', gap: 12 }}>
        <div style={{ padding: '6px 4px 2px' }}>
          <div style={{ fontWeight: 800, fontSize: 24, color: tp.text_color, marginBottom: 4 }}>VPN</div>
          <div style={{ fontSize: 13, color: tp.hint_color }}>Amnezia WireGuard · 🇺🇸 США · до 300 Мбит/с</div>
        </div>
        <div style={{
          background: 'var(--section-bg)', borderRadius: 16,
          padding: '20px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: tp.text_color, marginBottom: 4 }}>Нет активной подписки</div>
            <div style={{ fontSize: 12, color: tp.hint_color }}>от 180 ₽ / мес</div>
          </div>
          <button className="btn" style={{ fontSize: 13 }} onClick={goPlans}>
            {t('vpn_choose')}
          </button>
        </div>
        {status !== null && status.length > 0 && (
          <div style={{
            background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, color: tp.hint_color, marginRight: 4 }}>{t('vpn_servers')}</span>
            {status.map(s => (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: s.ok ? '#27ae60' : '#ff3b30',
                  display: 'inline-block', flexShrink: 0,
                }} />
                <span style={{ color: tp.text_color }}>{s.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const planName    = PLAN_NAMES[sub.plan] ?? sub.plan
  const pendingName = sub.pending_plan ? (PLAN_NAMES[sub.pending_plan] ?? sub.pending_plan) : null
  const isExpiring  = sub.days_remaining <= 7

  // Считаем слоты из конфигов
  const awgTotal    = configs?.filter(c => c.protocol === 'awg').length ?? 0
  const awgActive   = configs?.filter(c => c.protocol === 'awg' && c.status === 'active').length ?? 0
  const vlessTotal  = configs?.filter(c => c.protocol === 'vless').length ?? 0
  const vlessActive = configs?.filter(c => c.protocol === 'vless' && c.status === 'active').length ?? 0

  return (
    <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)' }}>

      <div style={{ padding: '6px 4px 2px' }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: tp.text_color, marginBottom: 4 }}>VPN</div>
        <div style={{ fontSize: 13, color: tp.hint_color }}>Amnezia WireGuard · 🇺🇸 США</div>
      </div>

      {/* Предупреждение о скором истечении */}
      {isExpiring && (
        <div className="fade-in" style={{
          background: sub.days_remaining <= 3 ? 'rgba(255,59,48,0.12)' : 'rgba(230,126,34,0.12)',
          border: `1px solid ${sub.days_remaining <= 3 ? 'rgba(255,59,48,0.3)' : 'rgba(230,126,34,0.3)'}`,
          borderRadius: 12, padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: sub.days_remaining <= 3 ? '#ff3b30' : '#e67e22' }}>
              {sub.days_remaining <= 3 ? '🚨 Подписка скоро истечёт' : '⚠️ Мало времени'}
            </div>
            <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 2 }}>
              Осталось {sub.days_remaining} {sub.days_remaining === 1 ? 'день' : 'дня'}
            </div>
          </div>
          <button onClick={goPlans} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: sub.days_remaining <= 3 ? '#ff3b30' : '#e67e22',
            color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}>Продлить</button>
        </div>
      )}

      {/* Статус серверов */}
      {status !== null && (
        <div className="fade-in" style={{
          background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: tp.hint_color, marginRight: 4 }}>{t('vpn_servers')}</span>
          {status.length === 0 && (
            <span style={{ fontSize: 12, color: tp.hint_color }}>нет данных</span>
          )}
          {status.map(s => (
            <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.ok ? '#27ae60' : '#ff3b30',
                display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ color: tp.text_color }}>{s.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Карточка подписки */}
      <div className="fade-in-1 fade-in" style={{
        background: 'var(--section-bg)', borderRadius: 16, padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: tp.hint_color, marginBottom: 2 }}>Активный тариф</div>
            <div style={{ fontWeight: 700, fontSize: 22, color: tp.text_color }}>{planName}</div>
            <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 2 }}>до {formatDate(sub.expires_at)}</div>
          </div>
          <span style={{
            background: 'rgba(39,174,96,0.15)', color: '#27ae60',
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, marginTop: 2, flexShrink: 0,
          }}>{t('vpn_active_badge')}</span>
        </div>

        {/* Слоты */}
        {(awgTotal > 0 || vlessTotal > 0) && (
          <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
            {awgTotal > 0 && (
              <div>
                <div style={{ fontSize: 10, color: tp.hint_color, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('vpn_slots_devs')}</div>
                <SlotDots active={awgActive} total={awgTotal} color="#27ae60" />
                <div style={{ fontSize: 11, color: tp.hint_color, marginTop: 3 }}>{awgActive} / {awgTotal} {t('vpn_connected')}</div>
              </div>
            )}
            {vlessTotal > 0 && (
              <div>
                <div style={{ fontSize: 10, color: tp.hint_color, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('vpn_slots_tv')}</div>
                <SlotDots active={vlessActive} total={vlessTotal} color="#8e44ad" />
                <div style={{ fontSize: 11, color: tp.hint_color, marginTop: 3 }}>{vlessActive} / {vlessTotal} {t('vpn_connected')}</div>
              </div>
            )}
          </div>
        )}

        <ExpiryBar daysLeft={sub.days_remaining} />

        {pendingName && (
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(230,126,34,0.1)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>⏳</span>
            <span style={{ fontSize: 12, color: '#e67e22' }}>
              Тариф изменится на <b>«{pendingName}»</b> со следующего месяца
            </span>
          </div>
        )}

        <button onClick={goPlans} style={{
          marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
          background: 'var(--tg-theme-button-color, #2481cc)',
          color: tp.button_text_color ?? '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('vpn_change')}
        </button>
      </div>

      {/* Быстрые действия */}
      <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
        {[
          {
            color: '#27ae60',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="#fff" strokeWidth="2"/><path d="M9 12h6M9 16h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
            title: t('vpn_my_configs'),
            sub: 'WireGuard профили',
            action: goConfigs,
          },
          {
            color: '#8e44ad',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z" stroke="#fff" strokeWidth="2"/><path d="M12 8v4l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>,
            title: t('vpn_instr'),
            sub: 'Как подключить Amnezia',
            action: goInstr,
          },
        ].map(({ color, icon, title, sub, action }, i, arr) => (
          <button key={title} onClick={action} style={{
            width: '100%', border: 'none', background: 'transparent',
            padding: '13px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
            borderBottom: i < arr.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: tp.text_color }}>{title}</div>
              <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>{sub}</div>
            </div>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="rgba(128,128,128,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
