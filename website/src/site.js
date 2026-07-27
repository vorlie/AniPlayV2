const header = document.querySelector('[data-header]')
const nav = document.querySelector('[data-nav]')
const navToggle = document.querySelector('[data-nav-toggle]')

function updateHeader() {
  header?.classList.toggle('is-scrolled', window.scrollY > 20)
}

function closeNavigation() {
  nav?.classList.remove('is-open')
  navToggle?.setAttribute('aria-expanded', 'false')
}

navToggle?.addEventListener('click', () => {
  const willOpen = !nav?.classList.contains('is-open')
  nav?.classList.toggle('is-open', willOpen)
  navToggle.setAttribute('aria-expanded', String(willOpen))
})

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeNavigation)
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNavigation()
})

window.addEventListener('scroll', updateHeader, { passive: true })
updateHeader()

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const reveals = document.querySelectorAll('.reveal')

if (reducedMotion || !('IntersectionObserver' in window)) {
  reveals.forEach((element) => element.classList.add('is-visible'))
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px' },
  )
  reveals.forEach((element) => observer.observe(element))
}

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = String(new Date().getFullYear())
})

async function updateLatestRelease() {
  try {
    const response = await fetch(
      'https://api.github.com/repos/vorlie/AniPlayV2/releases/latest',
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (!response.ok) return
    const release = await response.json()
    if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') return

    document.querySelectorAll('[data-latest-version]').forEach((element) => {
      element.textContent = release.tag_name
    })
    document.querySelectorAll('[data-release-link]').forEach((element) => {
      element.href = release.html_url
    })
  } catch {
    // The static releases/latest link remains usable when GitHub's API is unavailable.
  }
}

updateLatestRelease()
