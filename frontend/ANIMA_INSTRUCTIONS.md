# Figma → Anima MCP → Next.js integration guide

This file describes a safe, repeatable workflow to convert a Figma landing page design into React code and integrate it into this Next.js app using Anima (MCP server).

1. Prepare a polished Figma design

- Create a single Figma file with frames for: Landing (hero + features), Sign In, Sign Up, and small components (header, footer, auth form).
- Use Auto Layout, named layers, and consistent tokens for spacing/colors so exported code is structured.

2. Use the Anima Figma plugin to sync

- Install Anima's Figma plugin and log into your Anima account.
- Select frames you want to export and use the plugin to "Sync" or "Export" them to Anima.
- In Anima, verify generated components and adjust export settings (responsive breakpoints, CSS-in-JS vs plain CSS, export as React).

3. Run Anima MCP server (local)

- Anima's MCP or design code server generates React code that you can pull into a project. Follow Anima docs for starting the MCP server locally or using the cloud export.
- Typical flow: export from Anima → download a ZIP or pull components via the MCP server API → copy into your project.

4. Integrate the generated React code into this Next.js app

- Place generated components under `frontend/src/components/` (or a subfolder) and verify imports.
- If Anima exported plain CSS, either import the generated CSS into `src/app/globals.css` or convert to Tailwind utility classes.
- Replace the placeholder `landing/page.tsx`, `signin/page.tsx`, and `signup/page.tsx` with the Anima-generated components or compose them together.

5. Make the code Next.js App Router friendly

- Ensure any client-side interactive components include the `"use client"` directive at the top of the file.
- Convert class-based or global CSS selectors to Tailwind or module-scoped styles if desired.

6. Verify and iterate

- Run the dev server:

```
cd frontend
npm install
npm run dev
```

- Open `http://localhost:3000/landing` to see the landing page, then go to `/signin` and `/signup`.
- Iterate in Figma → Anima → pull updates into the project as needed.

Notes

- This repository already uses Tailwind; prefer exporting CSS variables or tokens from Figma and mapping them to Tailwind utilities.
- If you want me to wire an exported Anima React bundle into the project, provide the exported ZIP or the Anima MCP server URL and I can pull and adapt the files directly.
