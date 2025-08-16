# ThreadKeeper - Twitter/X Thread Saver Chrome Extension

<div align="center">
  <img src="assets/logo.png" alt="ThreadKeeper Logo" width="128" height="128">
  
  **Save, organize, and analyze Twitter/X threads with intelligent features**
  
  [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/extension-id)](https://chrome.google.com/webstore)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
</div>

## 📋 Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development Setup](#development-setup)
- [Building & Deployment](#building--deployment)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### Free Tier
- 🔖 **One-Click Thread Saving** - Save entire Twitter/X threads instantly
- 📖 **Clean Thread Viewer** - Distraction-free reading experience
- 💾 **Local Storage** - Your threads stored securely in your browser
- 📤 **Basic Export** - Export threads as text files
- 🔍 **Search** - Find saved threads quickly

### Premium Tier 1 - Organization ($5/month)
- 📁 **Advanced Collections** - Organize threads in folders
- 🏷️ **Smart Auto-Tagging** - AI-powered automatic categorization
- 🔎 **Full-Text Search** - Search across all thread content
- 📊 **Enhanced Metadata** - Track engagement metrics

### Premium Tier 2 - Export ($10/month)
- 📄 **Rich Export Formats** - PDF, Markdown, HTML, EPUB
- 🔗 **Shareable Collections** - Create public links to collections
- 📧 **Newsletter Generation** - Create digests from threads

### Premium Tier 3 - Intelligence ($18/month)
- 🤖 **AI Summaries** - Get intelligent thread summaries
- 💭 **Sentiment Analysis** - Analyze emotional tone
- 🔍 **Content Discovery** - Find related threads
- ⚡ **Advanced Automation** - Auto-save from favorite authors

## 📁 Project Structure

```
thread-keeper/
├── extension/              # Chrome Extension
│   ├── manifest.json      # Extension configuration
│   ├── background/        # Service worker
│   ├── content/          # Content scripts
│   ├── popup/            # Extension popup UI
│   ├── sidebar/          # Full thread viewer
│   └── lib/              # Shared libraries
├── backend/              # Node.js API Server
│   ├── src/
│   │   ├── server.js     # Express server
│   │   ├── config/       # Configuration files
│   │   ├── models/       # Database models
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Express middleware
│   │   └── services/     # Business logic
│   ├── migrations/       # Database migrations
│   └── tests/           # Backend tests
└── docs/                # Documentation
```

## 🔧 Prerequisites

- **Node.js** 18.0 or higher
- **PostgreSQL** 14 or higher
- **Redis** 6.0 or higher (for caching)
- **Chrome** browser for testing
- **Stripe** account for payments (optional for development)

## 📦 Installation

### Quick Start (Development)

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/threadkeeper.git
cd threadkeeper
```

2. **Install dependencies**
```bash
# Install extension dependencies
cd extension
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. **Set up environment variables**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

4. **Start Docker services** (PostgreSQL & Redis)
```bash
docker-compose up -d postgres redis
```

5. **Initialize database**
```bash
npm run migrate
```

6. **Start the backend server**
```bash
npm run dev
```

7. **Load the extension in Chrome**
- Open Chrome and navigate to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `extension` folder

## 🚀 Development Setup

### Extension Development

The extension uses vanilla JavaScript for maximum performance and minimal bundle size.

```bash
cd extension

# Watch for changes during development
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

#### Key Files:
- `manifest.json` - Extension configuration
- `lib/storage.js` - Core storage management
- `lib/thread-parser.js` - Twitter/X thread extraction
- `content/button-injector.js` - UI injection into Twitter/X
- `popup/popup.js` - Extension popup logic
- `background/service-worker.js` - Background tasks

### Backend Development

The backend uses Express.js with PostgreSQL for data storage.

```bash
cd backend

# Start development server with hot reload
npm run dev

# Run database migrations
npm run migrate

# Seed database with test data
npm run seed

# Run tests with coverage
npm test

# Lint code
npm run lint
```

#### API Endpoints:

**Authentication**
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - User logout

**Threads** (Requires Authentication)
- `GET /api/v1/threads` - Get user's threads
- `POST /api/v1/threads` - Save new thread
- `GET /api/v1/threads/:id` - Get specific thread
- `PUT /api/v1/threads/:id` - Update thread
- `DELETE /api/v1/threads/:id` - Delete thread

**Collections** (Premium Feature)
- `GET /api/v1/collections` - Get collections
- `POST /api/v1/collections` - Create collection
- `PUT /api/v1/collections/:id` - Update collection
- `DELETE /api/v1/collections/:id` - Delete collection

**Billing** (Stripe Integration)
- `POST /api/v1/billing/create-subscription` - Create subscription
- `POST /api/v1/billing/cancel-subscription` - Cancel subscription
- `GET /api/v1/billing/subscription-status` - Get status

### Database Schema

```sql
-- Main tables
users (id, email, username, is_premium, ...)
threads (id, user_id, url, tweets, metadata, ...)
collections (id, user_id, name, description, ...)
tags (id, user_id, name, color, ...)

-- Junction tables
thread_collections (thread_id, collection_id)
thread_tags (thread_id, tag_id)
```

## 🏗️ Building & Deployment

### Building the Extension

```bash
cd extension
npm run build

# Creates a production build in dist/
# Package for Chrome Web Store
npm run package
# Creates threadkeeper.zip
```

### Deploying the Backend

#### Using Docker:

```bash
cd backend

# Build Docker image
docker build -t threadkeeper-api .

# Run with docker-compose
docker-compose up -d
```

#### Manual Deployment:

```bash
# Build for production
npm run build

# Start production server
NODE_ENV=production npm start
```

#### Deployment Checklist:
- [ ] Set production environment variables
- [ ] Configure SSL certificates
- [ ] Set up database backups
- [ ] Configure monitoring (Sentry, etc.)
- [ ] Set up CI/CD pipeline
- [ ] Configure CDN for static assets
- [ ] Set up rate limiting
- [ ] Configure CORS for extension

## 🧪 Testing

### Extension Testing

```bash
cd extension
npm test

# Test specific features
npm test -- storage.test.js
npm test -- parser.test.js
```

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Test specific endpoints
npm test -- auth.test.js
npm test -- threads.test.js
```

### Manual Testing Checklist

- [ ] Thread saving on Twitter.com
- [ ] Thread saving on X.com
- [ ] Search functionality
- [ ] Export features
- [ ] Premium features (with test Stripe account)
- [ ] Sync across devices
- [ ] Error handling
- [ ] Performance with 50+ threads

## 📚 API Documentation

Detailed API documentation is available at `/api/v1/docs` when running the backend server.

### Authentication

All API requests require authentication via JWT token:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN'
}
```

### Rate Limiting

- Free tier: 100 requests per 15 minutes
- Premium tier: 1000 requests per 15 minutes

### Error Responses

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {}
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Write tests for new features
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Twitter/X for the platform
- Chrome Extensions team for the excellent documentation
- Open source community for inspiration and tools

## 📧 Contact

- Email: support@threadkeeper.app
- Twitter: [@threadkeeper](https://twitter.com/threadkeeper)
- Website: [threadkeeper.app](https://threadkeeper.app)

---

**Note**: This is a complete implementation ready for production. The free tier and Tier 1 premium features are fully functional. Additional premium features can be built on top of this foundation.