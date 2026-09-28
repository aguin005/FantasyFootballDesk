import Icon from './Icon.jsx'

/**
 * Floating glass tab bar. The lens behind the active tab slides on a spring
 * rather than jumping, and tapping the tab you are already on scrolls to the top.
 */
export default function TabBar({ tabs, active, onChange, inert }) {
  const index = Math.max(0, tabs.findIndex((tab) => tab.key === active))

  return (
    <nav
      className="tabbar glass"
      aria-label="Sections"
      style={{ '--count': tabs.length, '--index': index }}
      inert={inert ? '' : undefined}
    >
      <span className="tab-lens" aria-hidden="true" />
      {tabs.map((tab) => {
        const on = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            className={on ? 'tab is-active' : 'tab'}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(tab.key)}
          >
            <Icon name={tab.icon} strokeWidth={on ? 2.2 : 1.8} />
            <span className="tab-label">{tab.label}</span>
            {tab.alert && <span className="tab-dot" aria-label="Needs attention" />}
          </button>
        )
      })}
    </nav>
  )
}
