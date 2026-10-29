import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My-SNS',
    short_name: 'My-SNS',
    description: '発信を作り、今日投稿するものを確認し、各SNSへ順番に届けるための個人用SNSワークスペース',
    start_url: '/app/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#7c3aed',
    lang: 'ja',
    categories: ['productivity', 'social'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/my-sns.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/my-sns-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
