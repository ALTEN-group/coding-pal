import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const defaultBase = process.env.NODE_ENV === 'production'
  ? (process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/coding-pal/')
  : '/docs/'
const rawBase = process.env.VITEPRESS_BASE || defaultBase
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

export default withMermaid(defineConfig({
  title: 'Coding Pal',
  description: 'Persistent context catalog and AI guidance primitives for GitHub Copilot, Claude Code, and Cursor',
  base,
  vite: {
    server: {
      port: 5174,
      host: true,
    },
    // mermaid >= 11.16 pulls CJS-only fastdom, which vitepress-plugin-mermaid does not pre-bundle
    optimizeDeps: {
      include: ['fastdom', 'fastdom/extensions/fastdom-promised.js'],
    },
  },
  mermaid: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    flowchart: {
      htmlLabels: true,
      padding: 18,
      nodeSpacing: 50,
      rankSpacing: 45,
      curve: 'basis',
    },
    themeVariables: {
      fontSize: '13.5px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      edgeLabelBackground: 'transparent',
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: false,
    sidebar: [
      {
        items: [
          { text: 'Overview', link: '/guide/overview' },
          { text: 'Persistent Context', link: '/guide/persistent-context' },
          { text: 'Deterministic Controls', link: '/guide/deterministic-controls' },
        ],
      },
      {
        text: 'Use cases (By Domain)',
        collapsed: false,
        items: [
          { text: 'Think & Plan', link: '/guide/domain-think-plan' },
          { text: 'Automated Tests', link: '/guide/domain-testing' },
          { text: 'Audit & Remediation', link: '/guide/domain-audit' },
          { text: 'Specs & Docs', link: '/guide/domain-docs' },
          { text: 'Tech Stacks', link: '/guide/domain-stacks' },
        ],
      },
      {
        text: 'Primitives (By Type)',
        collapsed: false,
        items: [
          { text: 'Prompts Catalog', link: '/guide/catalog-prompts' },
          { text: 'Agents Catalog', link: '/guide/catalog-agents' },
          { text: 'Instructions Catalog', link: '/guide/catalog-instructions' },
          { text: 'Skills Catalog', link: '/guide/catalog-skills' },
        ],
      },
      {
        text: 'Markdown Schemas',
        collapsed: false,
        items: [
          { text: 'Prompts Schema', link: '/guide/schema-prompts' },
          { text: 'Agents Schema', link: '/guide/schema-agents' },
          { text: 'Instructions Schema', link: '/guide/schema-instructions' },
          { text: 'Skills Schema', link: '/guide/schema-skills' },
        ],
      },
      {
        text: 'Distribution & Tooling',
        collapsed: false,
        items: [
          { text: 'APM Distribution', link: '/guide/apm-distribution' },
          { text: 'Authoring Guide', link: '/guide/authoring-guide' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ALTEN-group/coding-pal' },
    ],
    footer: {
      message: 'Published and maintained by ALTEN',
    },
  },
}))
