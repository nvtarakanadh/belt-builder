# Frontend Deployment Guide

This frontend is configured for deployment on Vercel.

## Environment Variables

Set the following environment variable in your Vercel project:

- `VITE_API_BASE`: Your backend API URL (e.g., `https://your-backend.railway.app`)

## Vercel Deployment

1. **Connect Repository**
   - Go to Vercel and import your GitHub repository: `nvtarakanadh/belt-builder`
   - Vercel will automatically detect it's a Vite project

2. **Configure Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add `VITE_API_BASE` with your Railway backend URL
   - Make sure to add it for Production, Preview, and Development environments

3. **Deploy**
   - Vercel will automatically build and deploy on every push to main
   - The build command is: `npm run build` (or `pnpm build`)
   - The output directory is: `dist`

## Local Development

1. Create a `.env` file in the frontend directory:
   ```
   VITE_API_BASE=http://localhost:8000
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

## Build for Production

```bash
pnpm build
```

The built files will be in the `dist` directory.

