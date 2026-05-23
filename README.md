# AI Transcription & Analysis Platform

A robust microservices-based platform for transcribing audio/video content and generating deep AI-powered insights using Google Gemini 2.5 Flash.

## 🚀 Key Features

- **Multi-Source Upload:** Support for direct file uploads and YouTube URL processing.
- **AI Analysis:** Automated transcription and structured analysis (summary, detailed insights, key topics, takeaways).
- **Interactive Learning:** Procedurally generated flashcards and quizzes based on content.
- **Global Search:** Full-text search across all transcriptions with Redis caching.
- **Unified Entry Point:** Nginx reverse-proxy routes both frontend and API traffic through a single port.
- **Admin Dashboard:** System-wide statistics, user activity monitoring, and language distribution.
- **Security:** JWT-based authentication and secure API Gateway (internal network).

## ✨ Premium UI/UX & High-Performance Core

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

## 🏗 Architecture

The project is built on a distributed microservices architecture:

- **Nginx (Frontend Container):** Acts as the single entry point. Serves the React SPA and proxies `/api` requests to the Gateway.
- **API Gateway:** Internal router (Node.js/Express) handling service orchestration, security, and authentication.
- **User Service:** Manages user registration, profiles, and password security.
- **Upload Service:** Handles multi-part file uploads and YouTube link processing via RabbitMQ.
- **AI Processing Service:** Python-based worker using Google Generative AI (Gemini 2.5 Flash).
- **Search Service:** High-performance search and history management with Redis caching.

## 🛠 Tech Stack

- **Backend:** Node.js (Express), Python (Psycopg2, Google Generative AI).
- **Frontend:** React, Vite, Nginx.
- **Database:** PostgreSQL.
- **Cache:** Redis.
- **Messaging:** RabbitMQ.
- **Containerization:** Docker & Docker Compose.

## 🚦 Getting Started

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
    ```

3.  **Launch the platform:**
    ```bash
    docker-compose up --build
    ```

4.  **Access the application:**
    - **Web Interface:** `http://localhost:8000` (All traffic)
    - **API Base URL:** `http://localhost:8000/api`
    - **RabbitMQ Admin:** `http://localhost:15672` (guest/guest)

## 📖 API Usage (via Proxy)

All requests should be sent to port **8000**.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/users/login` | POST | Authentication |
| `/api/upload` | POST | Media file upload |
| `/api/upload/youtube` | POST | YouTube link processing |
| `/api/search?q=query` | GET | Search transcriptions |
| `/api/history` | GET | Get user history |

## 🛡 Security

- **Single Entry Point:** Only port 8000 is exposed; all microservices are isolated within the Docker network.
- **Parameterized SQL:** Protection against SQL injection.
- **Secure Hashing:** Bcrypt for passwords.
- **JWT:** Stateless authentication for all API routes.

## 📄 License

This project is licensed under the MIT License.
