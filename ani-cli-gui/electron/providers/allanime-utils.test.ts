import { describe, expect, it } from 'vitest'
import { expandWixRepackagerUrl } from './allanime-utils'

describe('expandWixRepackagerUrl', () => {
  it('removes the urlset quality list without retaining its leading comma', () => {
    const input = 'https://repackager.wixmp.com/video.wixstatic.com/video/46625e_425abaf905b242cf8dde6e7c98bc51ee/,360p,720p,1080p,/mp4/file.mp4.urlset/master.m3u8'

    expect(expandWixRepackagerUrl(input)).toEqual([
      {
        url: 'https://video.wixstatic.com/video/46625e_425abaf905b242cf8dde6e7c98bc51ee/360p/mp4/file.mp4',
        resolution: '360p',
      },
      {
        url: 'https://video.wixstatic.com/video/46625e_425abaf905b242cf8dde6e7c98bc51ee/720p/mp4/file.mp4',
        resolution: '720p',
      },
      {
        url: 'https://video.wixstatic.com/video/46625e_425abaf905b242cf8dde6e7c98bc51ee/1080p/mp4/file.mp4',
        resolution: '1080p',
      },
    ])
  })
})
