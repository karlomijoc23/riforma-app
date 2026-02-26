# Riforma Frontend

React 19 SPA for the Riforma property management platform.

## Development

```bash
npm install
npm start          # Dev server on port 3000
npx craco build    # Production build
CI=true npx craco test --watch=false --runInBand --detectOpenHandles
```

## Stack

- React 19 + craco (CRA override)
- Tailwind CSS + Shadcn/Radix UI
- Framer Motion for animations
- html2canvas + jsPDF for PDF reports

See the root [README.md](../README.md) for full project documentation.
