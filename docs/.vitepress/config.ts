import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenClaw Tracing',
  description: 'Agent execution tracing plugin for OpenClaw',
  base: '/openclaw-tracing/',
  head: [['link', { rel: 'icon', href: '/openclaw-tracing/favicon.ico' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Integrations', link: '/integrations/duckdb' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'GitHub', link: 'https://github.com/fengsxy/openclaw-tracing' },
      { text: 'npm', link: 'https://www.npmjs.com/package/openclaw-tracing' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Web UI', link: '/guide/web-ui' },
          { text: 'CLI Commands', link: '/guide/cli' },
          { text: 'Chat Commands', link: '/guide/chat-commands' },
          { text: 'Work Index', link: '/guide/work-index' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'DuckDB', link: '/integrations/duckdb' },
          { text: 'Apache Iceberg', link: '/integrations/iceberg' },
          { text: 'PuppyGraph', link: '/integrations/puppygraph' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Reference', link: '/reference/cli' },
          { text: 'Span Schema', link: '/reference/schema' },
          { text: 'SQL Queries', link: '/reference/queries' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/fengsxy/openclaw-tracing' },
    ],
    footer: {
      message: 'Released under the MIT License.',
    },
    search: {
      provider: 'local',
    },
  },
})
