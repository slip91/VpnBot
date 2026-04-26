import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'

// ── Типы ─────────────────────────────────────────────────────────────────────

interface Instruction {
  id:    string
  title: string
  steps: string[]
  link?: { label: string; url: string }
}

// ── AWG-инструкции ────────────────────────────────────────────────────────────

const AWG_INSTRUCTIONS: Instruction[] = [
  { id: 'ios',     title: 'iPhone / iPad',     steps: [
    'Скачай Amnezia VPN из App Store',
    'Открой бота и скачай .conf файл',
    'Нажми «Поделиться» → «Открыть в Amnezia VPN»',
    'Нажми «Подключиться» — готово!',
  ], link: { label: 'App Store', url: 'https://apps.apple.com/app/amneziavpn/id1600529126' } },
  { id: 'android', title: 'Android',            steps: [
    'Скачай Amnezia VPN из Google Play или GitHub',
    'Открой бота и скачай .conf файл',
    'В приложении нажми «+» → «Добавить файл»',
    'Выбери скачанный .conf файл',
    'Нажми «Подключиться»',
  ], link: { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=org.amnezia.vpn' } },
  { id: 'windows', title: 'Windows',            steps: [
    'Скачай Amnezia VPN с GitHub (файл AmneziaVPN_x.x.x_windows.exe)',
    'Установи и запусти приложение',
    'Нажми «+» → «Добавить конфигурацию из файла»',
    'Выбери .conf файл из Telegram',
    'Нажми «Подключиться»',
  ], link: { label: 'GitHub Releases', url: 'https://github.com/amnezia-vpn/amnezia-client/releases' } },
  { id: 'macos',   title: 'macOS',             steps: [
    'Скачай Amnezia VPN из App Store или GitHub',
    'Открой приложение',
    'Нажми «+» → «Добавить из файла»',
    'Выбери .conf файл',
    'Нажми «Подключиться»',
  ], link: { label: 'App Store', url: 'https://apps.apple.com/app/amneziavpn/id1600529126' } },
  { id: 'androidtv', title: 'Android TV',      steps: [
    'Установи Amnezia VPN через ADB или файловый менеджер',
    'Загрузи .conf на USB-флешку или в облако',
    'В приложении нажми «Добавить из файла»',
    'Выбери конфиг с флешки',
    'Нажми «Подключиться»',
  ], link: { label: 'GitHub (APK)', url: 'https://github.com/amnezia-vpn/amnezia-client/releases' } },
]

const VLESS_INSTRUCTIONS: Instruction[] = [
  { id: 'smarttube',  title: 'SmartTube (Android TV)', steps: [
    'Установи v2rayNG на Android TV',
    'Импортируй VLESS-ссылку из бота',
    'В SmartTube выбери прокси → v2ray',
    'Укажи адрес 127.0.0.1 и порт приложения',
  ] },
  { id: 'v2rayng', title: 'v2rayNG (Android)',    steps: [
    'Установи v2rayNG из Google Play',
    'Нажми «+» → «Импортировать из буфера»',
    'Вставь VLESS-ссылку из бота',
    'Нажми значок запуска',
  ], link: { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.v2ray.ang' } },
  { id: 'streisand', title: 'Streisand (iOS)',    steps: [
    'Установи Streisand из App Store',
    'Нажми «+» → «Импортировать»',
    'Вставь VLESS-ссылку или отсканируй QR',
    'Нажми «Подключиться»',
  ], link: { label: 'App Store', url: 'https://apps.apple.com/app/streisand/id6450534064' } },
]

// ── Аккордеон-элемент ─────────────────────────────────────────────────────────

function DeviceIcon({ id }: { id: string }) {
  const s = { width: 18, height: 18 }
  if (id === 'ios' || id === 'streisand') return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="2" width="14" height="20" rx="2" stroke="#fff" strokeWidth="2"/>
      <line x1="9" y1="18" x2="15" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
  if (id === 'android' || id === 'v2rayng') return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="1" width="14" height="22" rx="2" stroke="#fff" strokeWidth="2"/>
      <line x1="9" y1="17" x2="15" y2="17" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="5" x2="12" y2="2" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="19" x2="12" y2="22" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
  if (id === 'windows') return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" stroke="#fff" strokeWidth="2"/>
      <rect x="13" y="3" width="8" height="8" stroke="#fff" strokeWidth="2"/>
      <rect x="3" y="13" width="8" height="8" stroke="#fff" strokeWidth="2"/>
      <rect x="13" y="13" width="8" height="8" stroke="#fff" strokeWidth="2"/>
    </svg>
  )
  if (id === 'macos') return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <path d="M17 5.5C17 4.1 15.9 3 14.5 3c-.8 0-1.5.3-2 .8-.5-.5-1.2-.8-2-.8C9.1 3 8 4.1 8 5.5c0 .4.1.7.3 1.1-.5.4-.8 1-.8 1.6 0 .4.1.7.2 1C7.1 9.7 6.6 10 6 10c-.3 0-.5-.1-.7-.2-.2.3-.3.6-.3 1 0 .8.6 1.5 1.4 1.8-.1.4-.2.8-.2 1.2 0 1 .4 1.9 1 2.6.6.6 1.4 1 2.3 1 1 0 1.8-.4 2.3-1 .5.6 1.3 1 2.3 1 1 0 1.8-.4 2.3-1 .5.6 1.3 1 2.3 1 1 0 1.8-.4 2.3-1 .5.6 1.3 1 2.3 1 1 0 1.8-.4 2.3-1 .5.6 1 1 1.7 1 .6 0 1.1-.4 1.1-1 0-.6-.4-1-1.1-1-.6 0-1.2-.4-1.6-1-.5-.7-1.2-1.8-1.2-3 0-1.2.5-2.1 1.3-2.8.7-.6 1.6-.9 2.6-.9.5 0 1 .1 1.4.2.2-.6.2-1.2.2-1.8 0-.6-.1-1.2-.2-1.8-.4.1-.9.2-1.4.2-1 0-1.9-.4-2.6-1-.8-.7-1.3-1.7-1.3-2.8 0-.3 0-.6.1-.9.5-.3.9-.7.9-1.3 0-.3-.1-.6-.4-.9-.3-.4-.7-.6-1.2-.6-.4 0-.8.2-1.2.5-.4.4-.7.9-.8 1.5-.1.6-.2 1.3-.2 2 0 .7.1 1.3.2 2-.2.3-.3.5-.5.8z" stroke="#fff" strokeWidth="1.2"/>
    </svg>
  )
  return (
    <svg style={s} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="14" rx="2" stroke="#fff" strokeWidth="2"/>
      <line x1="8" y1="21" x2="16" y2="21" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="18" x2="12" y2="21" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      <line x1="7" y1="8" x2="17" y2="8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

const DEVICE_COLORS: Record<string, string> = {
  ios: '#007aff', android: '#27ae60', windows: '#0078d4',
  macos: '#888', androidtv: '#8e44ad', smarttube: '#8e44ad',
  v2rayng: '#27ae60', streisand: '#007aff',
}

function AccordionGroup({ items, accentColor }: { items: Instruction[]; accentColor: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const tp = WebApp.themeParams

  return (
    <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
      {items.map((item, i) => {
        const isOpen = open === item.id
        const color = DEVICE_COLORS[item.id] ?? accentColor
        return (
          <div key={item.id}>
            <button
              onClick={() => { setOpen(isOpen ? null : item.id); WebApp.HapticFeedback.selectionChanged() }}
              style={{
                width: '100%', border: 'none', background: 'transparent',
                padding: '13px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                borderBottom: (isOpen || i < items.length - 1) ? '1px solid rgba(128,128,128,0.1)' : 'none',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <DeviceIcon id={item.id} />
              </div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: tp.text_color, textAlign: 'left' }}>
                {item.title}
              </span>
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{
                transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0,
              }}>
                <path d="M1 1l5 5-5 5" stroke="rgba(128,128,128,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {isOpen && (
              <div style={{
                padding: '12px 16px 16px 70px',
                borderBottom: i < items.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none',
              }}>
                <ol style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
                  {item.steps.map((step, si) => (
                    <li key={si} style={{ fontSize: 13, color: tp.text_color, marginBottom: 2 }}>{step}</li>
                  ))}
                </ol>
                {item.link && (
                  <a href={item.link.url} target="_blank" rel="noreferrer" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    marginTop: 10, fontSize: 13,
                    color: 'var(--tg-theme-link-color, #2481cc)', textDecoration: 'none',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {item.link.label}
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Основной компонент ────────────────────────────────────────────────────────

export default function Instructions() {
  const nav = useNavigate()
  const tp  = WebApp.themeParams

  useEffect(() => {
    WebApp.BackButton.show()
    WebApp.BackButton.onClick(() => nav('/vpn'))
    return () => {
      WebApp.BackButton.hide()
      WebApp.BackButton.offClick(() => nav('/vpn'))
    }
  }, [nav])

  return (
    <div className="page" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)' }}>
      <div style={{ padding: '6px 4px 2px' }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: tp.text_color, marginBottom: 4 }}>Инструкции</div>
        <div style={{ fontSize: 13, color: tp.hint_color }}>Как подключить VPN на своём устройстве</div>
      </div>

      {/* AWG */}
      <span className="section-title">Amnezia WireGuard</span>
      <div style={{ fontSize: 12, color: tp.hint_color, margin: '-4px 4px 4px' }}>
        Основной протокол — обходит блокировки, работает на всех устройствах
      </div>
      <AccordionGroup items={AWG_INSTRUCTIONS} accentColor="#27ae60" />

      {/* VLESS */}
      <span className="section-title" style={{ paddingTop: 8 }}>VLESS — Smart TV</span>
      <div style={{ fontSize: 12, color: tp.hint_color, margin: '-4px 4px 4px' }}>
        Для Smart TV и роутеров · Доступен в тарифах «Про» и «Семейный»
      </div>
      <div style={{ background: 'var(--section-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: '#8e44ad',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: tp.text_color }}>VLESS-конфиги скоро</div>
            <div style={{ fontSize: 12, color: tp.hint_color, marginTop: 1 }}>Пока доступен только AWG</div>
          </div>
        </div>
      </div>
      <AccordionGroup items={VLESS_INSTRUCTIONS} accentColor="#8e44ad" />
    </div>
  )
}
