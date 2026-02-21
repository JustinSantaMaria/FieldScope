# FieldScope

## Overview
FieldScope is a mobile-first Progressive Web App (PWA) designed for signage and graphics survey teams. It enables field teams to create projects, organize areas, capture and annotate photos with measurement tools, and export survey data. Key capabilities include user authentication with role-based access (Admin/Team Member), canvas-based photo annotation with AI-assisted dimension classification, offline functionality, and multi-format exports (PDF reports, CSV). The project aims to streamline field survey processes, enhance data capture accuracy, and provide flexible data export options.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite as the build tool.
- **Routing**: Wouter.
- **State Management**: TanStack React Query for server state.
- **UI Components**: shadcn/ui (built on Radix UI) and Tailwind CSS for styling.
- **Photo Annotation**: react-konva for canvas-based annotation (rectangles, arrows, lines, text, dimension measurements). Features include client-side export, real-time style editing (color, stroke width, font size), and image rotation.
- **Forms**: react-hook-form with Zod validation.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript).
- **API Design**: REST endpoints with Zod schema validation.
- **Build**: esbuild for production bundling.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` with Drizzle-Zod for validation.
- **Session Storage**: PostgreSQL-backed sessions.

### Authentication
- **Provider**: Replit Auth (OpenID Connect).
- **Session Management**: Express sessions stored in PostgreSQL.
- **User Roles**: Admin and Member.

### AI Integration
- **Provider**: OpenAI API via Replit AI Integrations.
- **Features**: Chat completions, image generation, and dimension classification for measurement annotations.

### System Design
- **Export Management**: Robust, memory-efficient streaming export architecture with disk-based processing and signed URL uploads to prevent OOM errors during large exports. Includes automatic retention cleanup and orphaned temporary directory removal.
- **Data Management**: Soft delete with undo functionality for photos and areas.
- **Canonical Image Pipeline**: All uploaded photos are canonicalized on upload:
  - Format standardization: JPEG (quality 88) for photos, PNG for transparent/graphic images
  - EXIF orientation baked in (no more rotation metadata)
  - Transparency detection via alpha channel analysis (>1% threshold)
  - Screenshot/graphic detection via low color entropy heuristic
  - Stored fields: canonicalUrl, canonicalFormat, canonicalWidth, canonicalHeight, originalFormat, originalExifOrientation
  - Frontend and export pipeline use canonicalUrl with fallback to originalUrl for backward compatibility

### Code Organization
- `client/src/`: React frontend (components, hooks, pages, utilities).
- `server/`: Express backend (Replit integrations, routes, storage, DB connection).
- `shared/`: Shared code (Drizzle schema, API contracts, domain models).

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.

### AI Services
- **OpenAI API**: Used for chat, image generation, and dimension classification.

### Authentication
- **Replit OIDC**: OpenID Connect provider.

### Cloud Storage
- **Replit Object Storage**: For photo uploads and export file storage.
- **Multi-tenant Cloud Sync**: Google Drive, Dropbox, and OneDrive integrations for automatic export syncing.
  - OAuth flows with AES-256-GCM encrypted token storage per organization.
  - Admin-only controls: connect, choose folder, test upload, disconnect.
  - Sync button on Exports page to push completed exports to connected cloud storage.
  - Provider-specific implementations in `server/lib/providers/`.