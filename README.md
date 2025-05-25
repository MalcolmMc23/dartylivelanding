# 💬 Darty Live Landing - Omegle-like Video Chat

A modern, Omegle-inspired random video chat platform built with Next.js, featuring real-time matching, video chat, and a robust queue management system.

## 🚀 Features

- **🎯 Random Matching**: Instantly connect with strangers worldwide
- **📹 HD Video Chat**: Crystal clear video and audio powered by LiveKit
- **⚡ Real-time Queue**: Advanced queue management with instant matching
- **📱 Mobile Responsive**: Works perfectly on all devices
- **🔒 Safe & Secure**: Built-in safety features and moderation tools
- **🌐 Global Reach**: Connect with people from around the world

## 🎮 Try It Now

### Simple Omegle-like Experience

```
Visit: /simple-chat
```

Clean, modern interface with one-click random matching.

### Advanced Migration Dashboard

```
Visit: /admin/migration-control
```

Real-time monitoring and system management tools.

## 🏗️ Architecture

### Queue Management System

The platform features a sophisticated dual-queue architecture:

- **Simple Queue** (Phase 1 ✅): Streamlined matching with Redis-based atomic operations
- **Hybrid Queue** (Legacy): Original complex system for backwards compatibility
- **Unified Interface** (Phase 2 ✅): Seamless switching between queue systems
- **Feature Flags**: Dynamic system switching with real-time monitoring

### Components Architecture

- **Phase 3 ✅**: New Omegle-like components with modern UI/UX
- **Phase 4 ✅**: Complete migration strategy with parallel implementation

## 📱 User Experience

### The Flow

1. **Enter Username** - Quick, simple registration
2. **Find Random Match** - One-click matching with instant feedback
3. **Video Chat** - Full-screen video with simple controls
4. **Skip or Leave** - Easy navigation between conversations

### Key Pages

- `/simple-chat` - Main Omegle-like experience
- `/simple-chat/room/[roomName]` - Clean video chat interface
- `/admin/migration-control` - Advanced system management

## 🛠️ Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended)
- Redis server
- LiveKit server

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd darty_live_landing

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Configure your Redis, LiveKit, and other service URLs

# Run the development server
pnpm dev
```

### Environment Variables

```env
# Queue System Control
NEXT_PUBLIC_USE_SIMPLE_QUEUE=true

# LiveKit Configuration
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server.com
NEXT_PUBLIC_LIVEKIT_DEMO_URL=wss://your-demo-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Redis Configuration
REDIS_URL=redis://localhost:6379
```

### Quick Start Commands

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test
```

## 🔄 Migration System

### Feature Flag Control

Switch between queue systems dynamically:

```typescript
import { setQueueSystemOverride } from "@/utils/featureFlags";

// Switch to Simple Queue
setQueueSystemOverride("simple");

// Switch to Hybrid Queue
setQueueSystemOverride("hybrid");

// Reset to environment default
setQueueSystemOverride(null);
```

### Real-time Monitoring

Track migration progress and system health:

- User distribution across systems
- Response time monitoring
- Health status indicators
- Migration progress tracking

## 📖 Documentation

### Architecture Docs

- [`docs/SimpleQueueManager.md`](docs/SimpleQueueManager.md) - Queue system architecture
- [`docs/Phase3-Components.md`](docs/Phase3-Components.md) - New Omegle-like components
- [`QUEUE_PROCESSOR_README.md`](QUEUE_PROCESSOR_README.md) - Technical implementation

### API Documentation

- `/api/simple-queue` - Simple queue operations
- `/api/match-user` - Hybrid queue operations
- `/api/get-participant-token` - LiveKit token generation

## 🏛️ Tech Stack

### Frontend

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Lucide Icons** - Beautiful icon library

### Backend

- **Redis** - High-performance queue management
- **LiveKit** - Real-time video/audio infrastructure
- **Node.js** - Server-side runtime

### Key Libraries

- `@livekit/components-react` - Video chat components
- `livekit-client` - Real-time communication
- `redis` - Queue state management

## 🔧 Development

### Component Structure

```
src/
├── components/
│   ├── SimpleQueueManager.tsx      # Main queue interface
│   ├── SimpleRoomComponent.tsx     # Video chat room
│   ├── SimpleMatchingInterface.tsx # Landing page
│   ├── MigrationController.tsx     # Admin controls
│   └── ui/                        # Reusable UI components
├── services/
│   └── QueueService.ts            # Unified queue interface
├── utils/
│   ├── SimpleQueueManager.ts      # Simple queue implementation
│   └── featureFlags.ts           # Migration controls
└── app/
    ├── simple-chat/              # New Omegle-like pages
    └── admin/                    # Management interfaces
```

### Code Quality

- **ESLint** - Code linting and formatting
- **TypeScript** - Static type checking
- **Prettier** - Code formatting
- **Git Hooks** - Pre-commit validation

## 🚀 Deployment

### Production Checklist

- [ ] Configure Redis cluster for scalability
- [ ] Set up LiveKit production servers
- [ ] Configure environment variables
- [ ] Set up monitoring and logging
- [ ] Configure CDN for static assets

### Recommended Hosting

- **Vercel** - Frontend hosting with edge functions
- **Railway/Heroku** - Backend services
- **Redis Cloud** - Managed Redis hosting
- **LiveKit Cloud** - Managed video infrastructure

## 📊 Monitoring

### Queue Statistics

- Active users count
- Average matching time
- Success rates
- Error tracking

### Performance Metrics

- Response times
- Connection quality
- User retention
- System health

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **LiveKit** - For the excellent real-time video infrastructure
- **Omegle** - For the inspiration and user experience patterns
- **Next.js Team** - For the amazing React framework
- **Tailwind CSS** - For the utility-first CSS framework

---

**Built with ❤️ for connecting people worldwide**
