# Solidon docs

The documentation site for Solidon, served at https://docs.solidon.xyz. Built with Fumadocs (Next.js, MDX).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

Pages live in `content/docs` as MDX. The sidebar order is set by each folder's `meta.json`.
Machine-readable output: `/llms.txt`, `/llms-full.txt`, and every page as Markdown at `<page>.md`.
