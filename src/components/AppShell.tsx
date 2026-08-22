import type { ReactNode } from 'react'
import {
  BarChart3,
  CircleDollarSign,
  LayoutDashboard,
  Settings2,
  WalletCards,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PageKey } from '../domain/models'
import { APP_VERSION_LABEL } from '../shared/appVersion'

interface AppShellProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  children: ReactNode
}

interface NavigationItem {
  key: PageKey
  label: string
  shortLabel: string
  icon: LucideIcon
}

const navigationItems: NavigationItem[] = [
  { key: 'dashboard', label: '首頁總覽', shortLabel: '首頁', icon: LayoutDashboard },
  { key: 'assets', label: '資產管理', shortLabel: '資產', icon: WalletCards },
  { key: 'simulation', label: '質押模擬', shortLabel: '模擬', icon: BarChart3 },
  { key: 'cashflow', label: '現金流', shortLabel: '現金流', icon: CircleDollarSign },
  { key: 'settings', label: '設定', shortLabel: '設定', icon: Settings2 },
]

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-mark-line brand-mark-line-one" />
      <span className="brand-mark-line brand-mark-line-two" />
      <span className="brand-mark-line brand-mark-line-three" />
      <span className="brand-mark-trend" />
    </div>
  )
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const activeLabel = navigationItems.find((item) => item.key === activePage)?.label ?? '首頁總覽'

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <BrandMark />
          <div>
            <strong>資產槓桿</strong>
            <span>Cashflow Lab</span>
          </div>
        </div>

        <div className="sidebar-kicker">PERSONAL FINANCE OS</div>
        <nav className="sidebar-nav" aria-label="主要導覽">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`nav-item ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
                <span>{item.label}</span>
                {isActive && <span className="nav-active-dot" aria-hidden="true" />}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="offline-badge">
            <span className="status-dot" />
            <span>本機模式・離線可用</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="mobile-topbar">
          <div className="mobile-brand">
            <BrandMark />
            <div>
              <strong>資產槓桿</strong>
              <span>{activeLabel}</span>
            </div>
          </div>
          <span className="mobile-version" aria-label={`APP 版本 ${APP_VERSION_LABEL}`}>{APP_VERSION_LABEL}</span>
          <div className="offline-badge compact-offline-badge">
            <span className="status-dot" />
            <span>離線</span>
          </div>
        </header>

        <main className="main-content">{children}</main>

        <nav className="mobile-bottom-nav" aria-label="主要導覽">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`mobile-nav-item ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
                <span>{item.shortLabel}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
