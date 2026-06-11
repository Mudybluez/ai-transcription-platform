# AI Transcription & Analysis Platform

A robust microservices-based platform for transcribing audio/video content and generating deep AI-powered insights using Google Gemini 2.5 Flash.

##  Key Features

- **Multi-Source Upload:** Support for direct file uploads and YouTube URL processing.
- **AI Analysis:** Automated transcription and structured analysis (summary, detailed insights, key topics, takeaways) immediately in Russian, English, and Kazakh.
- **Interactive Learning:** Procedurally generated flashcards and quizzes based on content.
- **Interactive Mind Maps:** Dynamic visualization of content concepts and relations using interactive force-directed graphs (react-force-graph-2d).
- **Payment & Billing:** Commercial subscriptions (Standard, Lite, Pro) and token purchase integrated with Stripe and PayPal.
- **Real-Time Push Notifications:** WebSocket-based instant notifications on report readiness and job status updates.
- **Video Timeline Extraction:** Automated video frames cutting using FFmpeg to illustrate transcription summaries.
- **Global Search:** Full-text search across all transcriptions with Redis caching.
- **Unified Entry Point:** Nginx reverse-proxy routes both frontend and API traffic through a single port.
- **Admin Dashboard:** System-wide statistics, user activity monitoring, feedback moderation, and proxy status monitoring.
- **Security:** JWT-based stateless authentication, CSRF protection, Google reCAPTCHA v3 protection, DNS MX check for emails, and secure API Gateway.

##  Premium UI/UX & High-Performance Core

The platform features a state-of-the-art, high-end interactive user experience combined with strict performance optimizations:

- **Interactive Star Constellation Braces `{ }`**:
  - **Typographic Cubic Bezier Splines:** Mathematical $C^1$-continuous splines (modeled after premium geometric typefaces) render perfectly elegant, smooth curly braces that enclose the hero text.
  - **Zero-Gravity Spring Physics:** Snapping particles simulate Hooke's Law with viscous damping, creating a gorgeous fluid "elastic bounce" and settling inertia.
  - **Hollow Bold Contour (26px Width):** Particles are distributed strictly across the outer and inner borders of the bold shape, leaving the interior hollow and empty.
  - **Active Star Dispersal (Full Viewport Re-population):** On unhover, particles actively and slowly scatter back to their drifting background coordinates, completely filling the screen and leaving 0% trace of the braces.
  - **Symmetrical Progressive Waves:** Both snaps and releases propagate in slow-motion waves flowing from the center cusp outward.
  - **Twinkling Deep Space Background:** 120 background stars float peacefully in zero-gravity, gently twinkling with soft, randomized alpha oscillations.
- **Cinema-Grade Cinematic 3D Transitions**:
  - **Camera Fly-Through:** An immersive 3D perspective Z-axis entrance where the camera flies backward *through* the header text `"Turn video into knowledge"` (starting blurred and massive, then scaling down and settling).
  - **Planetary Zoom-Out:** Staggered planetary container zoom-out and blur fadeout on load.
- **Hardware-Accelerated 60+ FPS Core**:
  - **Zero-CPU Canvas Pausing:** The heavy 2D planetary simulation canvas automatically unmounts and freezes once the intro completes, substituting it with standard CSS radial gradients to yield **locked 60+ FPS (0% JS CPU overhead)**.
  - **GPU Compositing:** Optimizations preventing full-screen Gaussian blur repaints by utilizing CSS transforms and layer rendering.

##  Architecture

The project is built on a distributed microservices architecture:

- **Nginx (Frontend Container):** Acts as the single entry point. Serves the React SPA and proxies `/api` requests to the Gateway.
- **API Gateway:** Internal router (Node.js/Express) handling service orchestration, security, authentication, and WebSockets connection management.
- **User Service:** Manages user registration, profiles, email DNS verification, feedback moderation, reCAPTCHA, and Stripe/PayPal billing.
- **Upload Service:** Handles multi-part file uploads and YouTube link processing via RabbitMQ.
- **AI Processing Service:** Python-based worker using Google Generative AI (Gemini 3.1 Flash Lite), FFmpeg screenshotting, and OpenAI Whisper.
- **Search Service:** High-performance search, history management, and proxy status calculations with Redis caching.
- **MindMap Service:** FastAPI-based service storing and searching hierarchical mind maps.

##  Tech Stack

- **Backend:** Node.js (Express), Python (FastAPI, Psycopg2, Google Generative AI, OpenAI Whisper, FFmpeg, Uvicorn, Pydantic).
- **Frontend:** React, Vite, react-force-graph-2d, D3, react-markdown, Nginx.
- **Database:** PostgreSQL.
- **Cache:** Redis.
- **Messaging:** RabbitMQ.
- **Billing & Security:** Stripe, PayPal, Google reCAPTCHA v3.
- **Containerization:** Docker & Docker Compose.

##  Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)
- Google Gemini API Key

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/ai-transcription-platform.git
    cd ai-transcription-platform
    ```

2.  **Configure environment variables:**
    Create a `.env` file in the root directory:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key_here
    JWT_SECRET=your_custom_secret_key
    # Optional payment keys (fallbacks are used if not provided)
    STRIPE_SECRET_KEY=your_stripe_secret_key
    PAYPAL_CLIENT_ID=your_paypal_client_id
    PAYPAL_CLIENT_SECRET=your_paypal_client_secret
    # Optional security keys
    RECAPTCHA_SECRET_KEY=your_recaptcha_secret
    ```

3.  **Launch the platform:**
    ```bash
    docker-compose up --build
    ```

4.  **Access the application:**
    - **Web Interface:** `http://localhost:8000` (All traffic)
    - **API Base URL:** `http://localhost:8000/api`
    - **RabbitMQ Admin:** `http://localhost:15672` (guest/guest)

##  API Usage (via Proxy)

All requests should be sent to port **8000**.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/users/login` | POST | Authentication |
| `/api/users/register` | POST | User registration (reCAPTCHA and DNS MX checks) |
| `/api/users/verify-email` | GET | Verify email link confirmation |
| `/api/users/profile/:id` | GET | Retrieve user profile data |
| `/api/csrf-token` | GET | Get short-lived CSRF token |
| `/api/feedbacks` | POST / GET | Submit feedback / View feedbacks history |
| `/api/notifications` | GET / DELETE | Retrieve / Delete notifications |
| `/api/upload` | POST | Media file upload (generates job, queued in RabbitMQ) |
| `/api/upload/youtube` | POST | YouTube link processing (tries subtitles first, then downloads audio) |
| `/api/search?q=query` | GET | Search transcriptions with Redis caching |
| `/api/history` | GET | Get user history and analyses reports |
| `/api/mindmap/:id` | GET | Get interactive mindmap nodes and links |
| `/api/search/admin/proxy-stats` | GET | Retrieve AstroProxy billing statistics (Admin only) |
| `/api/users/change-password` | POST | Update user password |

##  Security

- **Single Entry Point:** Only port 8000 is exposed; all microservices are isolated within the Docker network.
- **Parameterized SQL:** Protection against SQL injection.
- **Secure Hashing:** Bcrypt for passwords.
- **JWT:** Stateless authentication for all API routes.

## 📄 License

This project is licensed under the MIT License.
