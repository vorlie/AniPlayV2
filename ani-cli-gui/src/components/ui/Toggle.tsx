export function Toggle({ active, onToggle, ariaLabel }: { active: boolean; onToggle: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      className={`settings-toggle ${active ? 'active' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      <span className="settings-toggle-track" />
    </button>
  )
}
