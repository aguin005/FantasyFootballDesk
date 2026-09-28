import Icon from './Icon.jsx'

/**
 * The top bar. Its title stays hidden while the large title is on screen and
 * fades in once that scrolls away, the collapsing title every iOS list uses.
 */
export default function NavBar({ title, subtitle, scrolled, refreshing, onRefresh, inert }) {
  return (
    <header className={scrolled ? 'nav is-scrolled' : 'nav'} inert={inert ? '' : undefined}>
      <div className="nav-row">
        <div className="nav-title" aria-hidden={!scrolled}>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="nav-actions">
          <button
            type="button"
            className={refreshing ? 'icon-btn glass press is-spinning' : 'icon-btn glass press'}
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? 'Refreshing' : 'Refresh'}
          >
            <Icon name="refresh" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </header>
  )
}
