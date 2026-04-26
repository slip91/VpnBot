import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'
import { LanguageProvider } from './i18n'
import BottomNav from './components/BottomNav'

import Home         from './pages/Home'
import VPN          from './pages/VPN'
import Plans        from './pages/Plans'
import Configs      from './pages/Configs'
import Instructions from './pages/Instructions'
import ESim         from './pages/ESim'
import ESimCountry  from './pages/ESimCountry'
import ESimFAQ      from './pages/ESimFAQ'
import Support      from './pages/Support'
import Referral     from './pages/Referral'

export default function App() {
  useEffect(() => {
    WebApp.ready()
    WebApp.expand()
  }, [])

  return (
    <LanguageProvider>
      <HashRouter>
        <Routes>
          {/* VPN */}
          <Route path="/vpn"          element={<VPN />} />
          <Route path="/vpn/plans"    element={<Plans />} />
          <Route path="/configs"      element={<Configs />} />
          <Route path="/instructions" element={<Instructions />} />

          {/* eSIM */}
          <Route path="/esim"         element={<ESim />} />
          <Route path="/esim/faq"     element={<ESimFAQ />} />
          <Route path="/esim/:code"   element={<ESimCountry />} />

          {/* Support & Referral */}
          <Route path="/support"      element={<Support />} />
          <Route path="/referral"     element={<Referral />} />

          {/* Главная */}
          <Route path="/"             element={<Home />} />
        </Routes>
        <BottomNav />
      </HashRouter>
    </LanguageProvider>
  )
}
