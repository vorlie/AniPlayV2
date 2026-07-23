import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShowcaseApi } from './demo-api'

const content = {
  provider: 'anikoto',
  showId: 'showcase:starfall-atelier',
  animeName: 'Starfall Atelier',
  episode: '1',
  translationType: 'sub' as const,
  aniListMediaId: 900001,
}

describe('showcase fixture API', () => {
  afterEach(() => vi.useRealTimers())

  it('returns fixed catalog, media, and subtitle fixtures', async () => {
    const api = createShowcaseApi('file:///showcase.mp4', 'file:///showcase.vtt')

    const results = await api.search('starfall', 'sub', 'anikoto')
    const links = await api.getEpisodeLinks()

    expect(results.data?.[0]).toMatchObject({ name: 'Starfall Atelier', episodes: 12 })
    expect(links.data?.[0]).toMatchObject({
      url: 'file:///showcase.mp4',
      provider: 'AniPlay Showcase',
      subtitles: [{ label: 'English', url: 'file:///showcase.vtt' }],
    })
    expect((await api.aniList.dashboard.get()).session.user?.name).toBe('AniPlayDemo')
  })

  it('emits deterministic Watch Together state and chat events', async () => {
    const api = createShowcaseApi()
    const changed = vi.fn()
    const unsubscribe = api.watchTogether.onChanged(changed)

    const room = await api.watchTogether.create({ content })
    await api.watchTogether.sendChat('The timing looks perfect.')

    expect(room).toMatchObject({ code: 'DEMO42ROOM', connected: true })
    expect(room.participants).toHaveLength(2)
    expect(changed).toHaveBeenCalledTimes(2)
    expect((await api.watchTogether.getState()).chat.at(-1)?.body).toBe('The timing looks perfect.')

    unsubscribe()
    await api.watchTogether.leave()
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('advances simulated downloads and cleans up subscriptions', async () => {
    vi.useFakeTimers()
    const api = createShowcaseApi()
    const changed = vi.fn()
    const unsubscribe = api.downloads.onChanged(changed)

    await api.downloads.start({
      animeId: content.showId,
      animeName: content.animeName,
      episode: content.episode,
      translationType: 'sub',
      catalogProvider: 'anikoto',
      provider: 'AniPlay Showcase',
      resolution: '1080p',
    })
    await vi.advanceTimersByTimeAsync(1_100)

    expect((await api.downloads.getState()).jobs[0]).toMatchObject({
      status: 'completed',
      progress: { percent: 100 },
    })
    expect(changed).toHaveBeenCalledTimes(4)

    unsubscribe()
    await api.downloads.clearFinished()
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('does not call fetch for any fixture workflow', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const api = createShowcaseApi()

    await api.aniList.dashboard.get()
    await api.search('', 'sub', 'allanime')
    await api.watchTogether.create({ content })
    await api.downloads.getState()
    await api.updater.check()
    await api.notices.refresh()

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
