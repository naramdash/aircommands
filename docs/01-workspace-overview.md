# Workspace Overview

## Scope

AirCommands is a Bun workspace monorepo with two active applications:

- apps/electron: Desktop app (Electron + Vue + Vite)
- apps/web: Web app and local API server (Nuxt 4 + Nitro)

## Repository Layout

- package.json: root workspace config (`workspaces: ["apps/*"]`)
- AGENTS.md: repository-level operating rules
- docs/: current technical documentation
- apps/electron: desktop package
- apps/web: web package

## Package Roles

### apps/electron

- Captures camera frames in renderer (`src/App.vue`)
- Runs gesture recognition state updates in renderer
- Sends app execution requests to main process through preload IPC
- Owns tray behavior, window lifecycle, and desktop notifications

### apps/web

- Runs the same gesture domain model for web usage
- Exposes local API routes:
  - `POST /api/apps/open`
  - `POST /api/open-chrome` (legacy path)
- Contains Vitest suites for gesture and server utility modules

## Current Reality (Important)

Gesture domain logic exists in both packages:

- apps/electron/src/utils/gesture_command_detection/*
- apps/web/app/utils/gesture_command_detection/*

This duplication is intentional in the current state, but future maintenance should consider a shared package.

## Root Command

- `bun run builds`: runs `build` script in all workspace apps
